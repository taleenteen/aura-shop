package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

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

// ForgotPassword emails a password reset link. The response is the same whether or not the
// email has an account, apart from the email ID the storefront uses to open the message.
func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req dto.ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}
	email := strings.TrimSpace(req.Email)
	if email == "" || !strings.Contains(email, "@") {
		response.ValidationFailed(w, "Enter the email you signed up with.", map[string]string{"email": "Enter a valid email address."})
		return
	}
	id, err := h.authService.RequestPasswordReset(r.Context(), email)
	if err != nil {
		slog.Error("password reset request failed", "error", err)
		response.InternalServerError(w, "could not send the reset email")
		return
	}
	response.Success(w, http.StatusOK, dto.ForgotPasswordResponse{EmailID: id}, nil)
}

// GetAccountEmail returns an account email (such as a password reset) by its ID.
func (h *AuthHandler) GetAccountEmail(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.NotFound(w, "email not found")
		return
	}
	msg, err := h.authService.GetAccountEmail(r.Context(), id)
	if err != nil {
		response.NotFound(w, "email not found")
		return
	}
	response.Success(w, http.StatusOK, msg, nil)
}

// ResetPassword sets a new password from a reset link and signs the user in.
func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req dto.ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}
	auth, err := h.authService.ResetPassword(r.Context(), req.Token, req.Password, middleware.GetGuestIDFromContext(r.Context()))
	switch {
	case errors.Is(err, service.ErrWeakPassword):
		response.ValidationFailed(w, err.Error(), map[string]string{"password": "Use at least 6 characters."})
	case errors.Is(err, service.ErrResetLinkInvalid):
		response.Error(w, http.StatusGone, "RESET_LINK_INVALID", "This reset link is invalid or has expired. Request a new one.")
	case err != nil:
		slog.Error("password reset failed", "error", err)
		response.InternalServerError(w, "could not reset the password")
	default:
		response.Success(w, http.StatusOK, auth, nil)
	}
}

// ChangePassword replaces the signed-in user's password.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		response.Unauthorized(w, "authentication required")
		return
	}
	var req dto.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}
	err := h.authService.ChangePassword(r.Context(), user.ID, req.CurrentPassword, req.NewPassword)
	switch {
	case errors.Is(err, service.ErrWeakPassword):
		response.ValidationFailed(w, err.Error(), map[string]string{"new_password": "Use at least 6 characters."})
	case errors.Is(err, service.ErrWrongPassword):
		response.ValidationFailed(w, err.Error(), map[string]string{"current_password": "That's not your current password."})
	case err != nil:
		slog.Error("password change failed", "user_id", user.ID, "error", err)
		response.InternalServerError(w, "could not change the password")
	default:
		response.Success(w, http.StatusOK, map[string]string{"message": "Password updated."}, nil)
	}
}
