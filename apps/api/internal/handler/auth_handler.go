package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"
	"aura-tech/api/internal/validate"
)

type AuthHandler struct {
	authService service.AuthService
}

func NewAuthHandler(authService service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Register godoc
//
//	@Summary		Create a customer account
//	@Description	Creates the account and signs the customer in. When a guest session header is sent, the guest bag and wishlist are merged into the new account.
//	@Tags			Auth
//	@Accept			json
//	@Produce		json
//	@Security		GuestSession
//	@Param			body	body		dto.RegisterRequest	true	"Account details"
//	@Success		201		{object}	response.Envelope{data=dto.AuthResponse}
//	@Failure		400		{object}	response.Envelope	"VALIDATION_FAILED with per-field error.fields, or invalid body"
//	@Failure		409		{object}	response.Envelope	"USER_ALREADY_EXISTS"
//	@Failure		500		{object}	response.Envelope
//	@Router			/auth/register [post]
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req dto.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	guestID := middleware.GetGuestIDFromContext(r.Context())
	authResp, err := h.authService.Register(r.Context(), req, guestID)
	if err != nil {
		var ve *service.ValidationError
		switch {
		case errors.As(err, &ve):
			response.ValidationFailed(w, "Some fields need attention.", ve.Fields)
		case errors.Is(err, service.ErrUserAlreadyExists):
			response.Error(w, http.StatusConflict, "USER_ALREADY_EXISTS", "An account with this email already exists. Sign in instead.")
		default:
			slog.Error("registration failed", "error", err)
			response.InternalServerError(w, "could not create the account")
		}
		return
	}

	response.Success(w, http.StatusCreated, authResp, nil)
}

// Login godoc
//
//	@Summary		Sign in
//	@Description	Returns a JWT valid for 7 days. When a guest session header is sent, the guest bag and wishlist are merged into the account.
//	@Tags			Auth
//	@Accept			json
//	@Produce		json
//	@Security		GuestSession
//	@Param			body	body		dto.LoginRequest	true	"Email and password"
//	@Success		200		{object}	response.Envelope{data=dto.AuthResponse}
//	@Failure		400		{object}	response.Envelope
//	@Failure		401		{object}	response.Envelope	"Invalid email or password"
//	@Failure		423		{object}	response.Envelope	"ACCOUNT_LOCKED after 5 wrong passwords in a row; Retry-After gives the seconds left"
//	@Failure		429		{object}	response.Envelope	"RATE_LIMITED"
//	@Failure		500		{object}	response.Envelope
//	@Router			/auth/login [post]
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req dto.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	guestID := middleware.GetGuestIDFromContext(r.Context())
	authResp, err := h.authService.Login(r.Context(), req, guestID)
	if err != nil {
		var locked *service.AccountLockedError
		switch {
		case errors.Is(err, service.ErrInvalidCredentials):
			response.Unauthorized(w, "invalid email or password")
		case errors.As(err, &locked):
			left := time.Until(locked.Until)
			wait := "1 minute"
			if minutes := int(math.Ceil(left.Minutes())); minutes > 1 {
				wait = fmt.Sprintf("%d minutes", minutes)
			}
			w.Header().Set("Retry-After", strconv.Itoa(max(1, int(math.Ceil(left.Seconds())))))
			response.Error(w, http.StatusLocked, "ACCOUNT_LOCKED",
				"Too many wrong passwords. Sign-in is paused for "+wait+", or reset your password to sign in now.")
		default:
			slog.Error("sign-in failed", "error", err)
			response.InternalServerError(w, "authentication failed")
		}
		return
	}

	response.Success(w, http.StatusOK, authResp, nil)
}

// Me godoc
//
//	@Summary	Get the signed-in profile
//	@Tags		Auth
//	@Produce	json
//	@Security	BearerAuth
//	@Success	200	{object}	response.Envelope{data=dto.UserDTO}
//	@Failure	401	{object}	response.Envelope
//	@Failure	404	{object}	response.Envelope
//	@Router		/auth/me [get]
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

// UpdateMe godoc
//
//	@Summary	Update the signed-in profile
//	@Tags		Auth
//	@Accept		json
//	@Produce	json
//	@Security	BearerAuth
//	@Param		body	body		dto.UpdateProfileRequest	true	"Profile fields"
//	@Success	200		{object}	response.Envelope{data=dto.UserDTO}
//	@Failure	400		{object}	response.Envelope	"VALIDATION_FAILED with per-field error.fields, or invalid body"
//	@Failure	401		{object}	response.Envelope
//	@Failure	404		{object}	response.Envelope
//	@Failure	500		{object}	response.Envelope
//	@Router		/auth/me [patch]
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
		var ve *service.ValidationError
		switch {
		case errors.As(err, &ve):
			response.ValidationFailed(w, "Some fields need attention.", ve.Fields)
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
//
//	@Summary		Request a password reset email
//	@Description	Emails a single-use reset link that expires after 30 minutes and closes any earlier unused link. The response is the same for unknown emails and admin accounts, except that email_id is only set when a reset email was sent.
//	@Tags			Auth
//	@Accept			json
//	@Produce		json
//	@Param			body	body		dto.ForgotPasswordRequest	true	"Account email"
//	@Success		200		{object}	response.Envelope{data=dto.ForgotPasswordResponse}
//	@Failure		400		{object}	response.Envelope	"VALIDATION_FAILED with per-field error.fields, or invalid body"
//	@Failure		500		{object}	response.Envelope
//	@Router			/auth/forgot-password [post]
func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req dto.ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}
	email, ok := validate.Email(req.Email)
	if !ok {
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
//
//	@Summary	Get an account email
//	@Tags		Auth
//	@Produce	json
//	@Param		id	path		string	true	"Email ID (UUID)"
//	@Success	200	{object}	response.Envelope{data=models.EmailMessage}
//	@Failure	400	{object}	response.Envelope	"Malformed email ID"
//	@Failure	404	{object}	response.Envelope
//	@Router		/auth/emails/{id} [get]
func (h *AuthHandler) GetAccountEmail(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid email id")
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
//
//	@Summary		Reset the password from a reset link
//	@Description	Sets the new password and signs the customer in. The link is single-use and every other open link for the account is closed. When a guest session header is sent, the guest bag and wishlist are merged into the account.
//	@Tags			Auth
//	@Accept			json
//	@Produce		json
//	@Security		GuestSession
//	@Param			body	body		dto.ResetPasswordRequest	true	"Reset token and new password"
//	@Success		200		{object}	response.Envelope{data=dto.AuthResponse}
//	@Failure		400		{object}	response.Envelope	"VALIDATION_FAILED with per-field error.fields, or invalid body"
//	@Failure		410		{object}	response.Envelope	"RESET_LINK_INVALID"
//	@Failure		500		{object}	response.Envelope
//	@Router			/auth/reset-password [post]
func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req dto.ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}
	auth, err := h.authService.ResetPassword(r.Context(), req.Token, req.Password, middleware.GetGuestIDFromContext(r.Context()))
	switch {
	case errors.Is(err, service.ErrWeakPassword):
		response.ValidationFailed(w, err.Error(), map[string]string{"password": service.PasswordRule})
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
//
//	@Summary		Change the password
//	@Description	Signs out every other device: tokens issued before the change stop working. The response carries a new token for this device, which replaces the one sent.
//	@Tags			Auth
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			body	body		dto.ChangePasswordRequest	true	"Current and new password"
//	@Success		200		{object}	response.Envelope{data=dto.AuthResponse}
//	@Failure		400		{object}	response.Envelope	"VALIDATION_FAILED with per-field error.fields (wrong current password or weak new password), or invalid body"
//	@Failure		401		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/auth/change-password [post]
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
	auth, err := h.authService.ChangePassword(r.Context(), user.ID, req.CurrentPassword, req.NewPassword)
	switch {
	case errors.Is(err, service.ErrWeakPassword):
		response.ValidationFailed(w, err.Error(), map[string]string{"new_password": service.PasswordRule})
	case errors.Is(err, service.ErrWrongPassword):
		response.ValidationFailed(w, err.Error(), map[string]string{"current_password": "That's not your current password."})
	case err != nil:
		slog.Error("password change failed", "user_id", user.ID, "error", err)
		response.InternalServerError(w, "could not change the password")
	default:
		response.Success(w, http.StatusOK, auth, nil)
	}
}

// SignOutOtherSessions signs the account out on every other device.
//
//	@Summary		Sign out of all other devices
//	@Description	Every token issued so far stops working. The response carries a new token for this device, which replaces the one sent.
//	@Tags			Auth
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	response.Envelope{data=dto.AuthResponse}
//	@Failure		401	{object}	response.Envelope
//	@Failure		500	{object}	response.Envelope
//	@Router			/auth/sign-out-others [post]
func (h *AuthHandler) SignOutOtherSessions(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		response.Unauthorized(w, "authentication required")
		return
	}
	auth, err := h.authService.SignOutOtherSessions(r.Context(), user.ID)
	if err != nil {
		slog.Error("sign out of other sessions failed", "user_id", user.ID, "error", err)
		response.InternalServerError(w, "could not sign out the other devices")
		return
	}
	response.Success(w, http.StatusOK, auth, nil)
}
