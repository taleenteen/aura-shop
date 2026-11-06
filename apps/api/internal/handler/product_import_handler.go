package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"
)

// ProductImportHandler serves the admin product CSV import.
type ProductImportHandler struct {
	svc   service.ProductImportService
	audit service.AuditService
}

func NewProductImportHandler(svc service.ProductImportService, audit service.AuditService) *ProductImportHandler {
	return &ProductImportHandler{svc: svc, audit: audit}
}

// maxImportBody leaves room for JSON escaping around a 2 MB CSV.
const maxImportBody = 3 << 20

func decodeImport(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxImportBody)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			response.Error(w, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "The file is larger than 2 MB. Split it into smaller files.")
			return false
		}
		response.BadRequest(w, "invalid request body")
		return false
	}
	return true
}

// Columns godoc
//
//	@Summary		List CSV import columns
//	@Description	Describes every column of the product CSV (level, whether required for new rows, format, example and notes), for the import guide and template.
//	@Tags			Admin · CSV import
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	response.Envelope{data=[]dto.ImportColumn}
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Router			/admin/imports/products/columns [get]
func (h *ProductImportHandler) Columns(w http.ResponseWriter, r *http.Request) {
	response.Success(w, http.StatusOK, h.svc.Columns(), nil)
}

// Preview godoc
//
//	@Summary		Preview a CSV import
//	@Description	Reads the CSV text (sent as JSON, max 2 MB) without saving anything. Each product is compared with the store: create, update, unchanged, name_match (same name, different slug) or error, with per-field changes (current vs incoming values), new SKUs and row-level issues. file_issues lists problems with the whole file.
//	@Tags			Admin · CSV import
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			body	body		dto.ImportRequest	true	"File name and CSV text"
//	@Success		200		{object}	response.Envelope{data=dto.ImportPreview}
//	@Failure		400		{object}	response.Envelope	"Invalid body"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		413		{object}	response.Envelope	"FILE_TOO_LARGE: over 2 MB"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/imports/products/preview [post]
func (h *ProductImportHandler) Preview(w http.ResponseWriter, r *http.Request) {
	var req dto.ImportRequest
	if !decodeImport(w, r, &req) {
		return
	}
	out, err := h.svc.Preview(r.Context(), req)
	if err != nil {
		slog.Error("import preview failed", "error", err)
		response.InternalServerError(w, "could not read the file")
		return
	}
	response.Success(w, http.StatusOK, out, nil)
}

// Commit godoc
//
//	@Summary		Import a CSV
//	@Description	Applies the CSV (sent as JSON, max 2 MB) using the admin's decisions, keyed by the preview's product key: action update, create or skip, and keep lists change keys whose current store values should be kept instead of the incoming ones. Returns counts and a per-product outcome. One audit log entry lists every product created or updated.
//	@Tags			Admin · CSV import
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			body	body		dto.ImportCommitRequest	true	"File name, CSV text and decisions"
//	@Success		200		{object}	response.Envelope{data=dto.ImportResult}
//	@Failure		400		{object}	response.Envelope	"Invalid body"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		413		{object}	response.Envelope	"FILE_TOO_LARGE: over 2 MB"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields when the file as a whole cannot be imported"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/imports/products/commit [post]
func (h *ProductImportHandler) Commit(w http.ResponseWriter, r *http.Request) {
	var req dto.ImportCommitRequest
	if !decodeImport(w, r, &req) {
		return
	}
	out, err := h.svc.Commit(r.Context(), req, actorFrom(r))
	if err != nil {
		var ve *service.ValidationError
		if errors.As(err, &ve) {
			response.ValidationFailed(w, "The file can't be imported.", ve.Fields)
			return
		}
		slog.Error("import failed", "error", err)
		response.InternalServerError(w, "could not import the file")
		return
	}
	slog.Info("product import", "file", req.Filename, "created", out.Created, "updated", out.Updated, "failed", out.Failed)
	if out.Created+out.Updated > 0 {
		// One entry for the file, listing each product it created or updated.
		changes := []models.AuditChange{}
		for _, o := range out.Outcomes {
			if o.Status == "created" || o.Status == "updated" {
				changes = append(changes, models.AuditChange{Field: o.Name, To: o.Status})
			}
		}
		h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{
			Action: "products.import", EntityType: "import", EntityLabel: req.Filename, Changes: changes,
		})
	}
	response.Success(w, http.StatusOK, out, nil)
}

// Export godoc
//
//	@Summary		Export products as CSV
//	@Description	Downloads every product as aura-products.csv in the import layout, one row per variant.
//	@Tags			Admin · CSV import
//	@Produce		text/csv
//	@Security		BearerAuth
//	@Success		200	{file}		file
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/imports/products/export [get]
func (h *ProductImportHandler) Export(w http.ResponseWriter, r *http.Request) {
	data, err := h.svc.Export(r.Context())
	if err != nil {
		slog.Error("product export failed", "error", err)
		response.InternalServerError(w, "could not export products")
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="aura-products.csv"`)
	_, _ = w.Write(data)
}
