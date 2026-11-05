package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"
)

type AuthHandler struct {
	authService service.AuthService
}

func NewAuthHandler(authService service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req dto.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	guestID := middleware.GetGuestIDFromContext(r.Context())
	authResp, err := h.authService.Register(r.Context(), req, guestID)
	if err != nil {
		if err == service.ErrUserAlreadyExists {
			response.Conflict(w, "USER_ALREADY_EXISTS", err.Error())
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.Success(w, http.StatusCreated, authResp, nil)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req dto.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	guestID := middleware.GetGuestIDFromContext(r.Context())
	authResp, err := h.authService.Login(r.Context(), req, guestID)
	if err != nil {
		if err == service.ErrInvalidCredentials {
			response.Unauthorized(w, "invalid email or password")
			return
		}
		response.InternalServerError(w, "authentication failed")
		return
	}

	response.Success(w, http.StatusOK, authResp, nil)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		response.Unauthorized(w, "authentication required")
		return
	}

	profile, err := h.authService.GetProfile(r.Context(), user.ID)
	if err != nil {
		response.NotFound(w, "user profile not found")
		return
	}

	response.Success(w, http.StatusOK, profile, nil)
}

func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		response.Unauthorized(w, "authentication required")
		return
	}

	var req dto.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	profile, err := h.authService.UpdateProfile(r.Context(), user.ID, req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidProfile):
			response.Error(w, http.StatusBadRequest, "INVALID_PROFILE", err.Error())
		case errors.Is(err, service.ErrUserNotFound):
			response.NotFound(w, "user profile not found")
		default:
			slog.Error("profile update failed", "user_id", user.ID, "error", err)
			response.InternalServerError(w, "failed to update profile")
		}
		return
	}

	response.Success(w, http.StatusOK, profile, nil)
}
