package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"
)

// ProductImportHandler serves the admin product CSV import.
type ProductImportHandler struct {
	svc service.ProductImportService
}

func NewProductImportHandler(svc service.ProductImportService) *ProductImportHandler {
	return &ProductImportHandler{svc: svc}
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

func (h *ProductImportHandler) Columns(w http.ResponseWriter, r *http.Request) {
	response.Success(w, http.StatusOK, h.svc.Columns(), nil)
}

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
	response.Success(w, http.StatusOK, out, nil)
}

// Export downloads every product as CSV in the import layout.
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
