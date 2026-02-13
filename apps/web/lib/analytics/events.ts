/**
 * PostHog Custom Event Tracking
 *
 * Centralized analytics event capture for the Alive app.
 * All custom events go through this module for consistency.
 *
 * PostHog autocapture handles basic clicks/pageviews automatically.
 * These are SEMANTIC events that capture user intent and funnel progression.
 */
import posthog from "posthog-js"

// ─── Helpers ────────────────────────────────────────────────────────────────

function capture(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return
  try {
    posthog.capture(event, properties)
  } catch {
    // PostHog not initialized — silently ignore
  }
}

/** Identify user for all subsequent events */
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return
  try {
    posthog.identify(userId, properties)
  } catch {
    // PostHog not initialized
  }
}

/** Reset identity on logout */
export function resetUser() {
  if (typeof window === "undefined") return
  try {
    posthog.reset()
  } catch {
    // PostHog not initialized
  }
}

// ─── Funnel: Landing → Login → Register → Chat ─────────────────────────────

/** User lands on root page (alive.best) */
export function trackLandingPageView() {
  capture("landing_page_viewed")
}

/** User clicks "Sign In" on landing/login page */
export function trackLoginStarted() {
  capture("login_started")
}

/** User submits login form */
export function trackLoginSubmitted() {
  capture("login_submitted")
}

/** Login succeeds */
export function trackLoginSuccess() {
  capture("login_success")
}

/** Login fails */
export function trackLoginFailed(reason: string) {
  capture("login_failed", { reason })
}

/** User clicks "Create Account" button */
export function trackSignupStarted() {
  capture("signup_started")
}

/** User submits signup form */
export function trackSignupSubmitted() {
  capture("signup_submitted")
}

/** Signup succeeds */
export function trackSignupSuccess() {
  capture("signup_success")
}

/** Signup fails */
export function trackSignupFailed(reason: string) {
  capture("signup_failed", { reason })
}

// ─── Auth Modal ─────────────────────────────────────────────────────────────

/** Auth modal opened (from any trigger) */
export function trackAuthModalOpened() {
  capture("auth_modal_opened")
}

/** Auth modal: email check step */
export function trackAuthEmailChecked(isExistingUser: boolean) {
  capture("auth_email_checked", { is_existing_user: isExistingUser })
}

// ─── Chat Page ──────────────────────────────────────────────────────────────

/** User reaches the chat page */
export function trackChatPageViewed(properties?: { workspace: string | null }) {
  capture("chat_page_viewed", properties)
}

/** User sends a message */
export function trackMessageSent(properties?: {
  workspace: string | null
  has_attachments: boolean
  plan_mode: boolean
  message_length: number
}) {
  capture("message_sent", properties)
}

/** AI response completes */
export function trackMessageCompleted(properties?: { workspace: string | null; duration_ms?: number }) {
  capture("message_completed", properties)
}

/** User stops streaming */
export function trackStreamStopped(properties?: { workspace: string | null }) {
  capture("stream_stopped", properties)
}

/** Stream error occurs */
export function trackStreamError(properties?: {
  workspace: string | null
  error_code?: string
  error_message?: string
}) {
  capture("stream_error", properties)
}

// ─── Workspace ──────────────────────────────────────────────────────────────

/** User selects/switches a workspace */
export function trackWorkspaceSelected(workspace: string) {
  capture("workspace_selected", { workspace })
}

/** User creates a new workspace (via deploy) */
export function trackWorkspaceCreated(workspace: string) {
  capture("workspace_created", { workspace })
}

// ─── Header Actions ─────────────────────────────────────────────────────────

/** User clicks Components button in header */
export function trackComponentsClicked() {
  capture("components_button_clicked")
}

/** User clicks Photos button in header */
export function trackPhotosClicked() {
  capture("photos_button_clicked")
}

/** User clicks Settings button in header */
export function trackSettingsClicked() {
  capture("settings_button_clicked")
}

/** User clicks Feedback button in header */
export function trackFeedbackClicked() {
  capture("feedback_button_clicked")
}

/** User toggles Preview panel */
export function trackPreviewToggled(isOpen: boolean) {
  capture("preview_toggled", { is_open: isOpen })
}

/** User toggles Debug/Live view */
export function trackDebugViewToggled(isDebug: boolean) {
  capture("debug_view_toggled", { is_debug: isDebug })
}

// ─── Templates / Components ─────────────────────────────────────────────────

/** Templates modal opened */
export function trackTemplatesModalOpened() {
  capture("templates_modal_opened")
}

/** User browses a template category */
export function trackTemplateCategoryViewed(category: string) {
  capture("template_category_viewed", { category })
}

/** User selects a template */
export function trackTemplateSelected(properties: { template_name: string; category: string }) {
  capture("template_selected", properties)
}

/** User inserts a template into chat */
export function trackTemplateInserted(properties: { template_name: string; category: string }) {
  capture("template_inserted", properties)
}

// ─── Settings ───────────────────────────────────────────────────────────────

/** Settings overlay opened */
export function trackSettingsOpened(initialTab?: string) {
  capture("settings_opened", { initial_tab: initialTab })
}

/** User switches settings tab */
export function trackSettingsTabChanged(tab: string) {
  capture("settings_tab_changed", { tab })
}

// ─── Automations ────────────────────────────────────────────────────────────

/** User opens automations settings tab */
export function trackAutomationsViewed() {
  capture("automations_viewed")
}

/** User creates an automation */
export function trackAutomationCreated(properties?: { cron?: string; has_prompt: boolean }) {
  capture("automation_created", properties)
}

/** User triggers an automation manually */
export function trackAutomationTriggered(automationId: string) {
  capture("automation_triggered", { automation_id: automationId })
}

/** User deletes an automation */
export function trackAutomationDeleted() {
  capture("automation_deleted")
}

// ─── Conversations & Tabs ───────────────────────────────────────────────────

/** User creates a new conversation */
export function trackConversationCreated() {
  capture("conversation_created")
}

/** User switches conversation */
export function trackConversationSwitched() {
  capture("conversation_switched")
}

/** User archives a conversation */
export function trackConversationArchived() {
  capture("conversation_archived")
}

/** User unarchives a conversation */
export function trackConversationUnarchived() {
  capture("conversation_unarchived")
}

/** User renames a conversation */
export function trackConversationRenamed() {
  capture("conversation_renamed")
}

/** User creates a new tab */
export function trackTabCreated() {
  capture("tab_created")
}

/** User closes a tab */
export function trackTabClosed() {
  capture("tab_closed")
}

/** User reopens a closed tab */
export function trackTabReopened() {
  capture("tab_reopened")
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

/** Sidebar opened */
export function trackSidebarOpened() {
  capture("sidebar_opened")
}

/** Sidebar closed */
export function trackSidebarClosed() {
  capture("sidebar_closed")
}

// ─── Feedback ───────────────────────────────────────────────────────────────

/** Feedback modal opened */
export function trackFeedbackModalOpened() {
  capture("feedback_modal_opened")
}

/** Feedback submitted */
export function trackFeedbackSubmitted() {
  capture("feedback_submitted")
}

// ─── GitHub Import ──────────────────────────────────────────────────────────

/** GitHub import modal opened */
export function trackGithubImportOpened() {
  capture("github_import_opened")
}

/** GitHub import started */
export function trackGithubImportStarted(repoUrl: string) {
  capture("github_import_started", { repo_url: repoUrl })
}

/** GitHub import completed */
export function trackGithubImportCompleted(workspace: string) {
  capture("github_import_completed", { workspace })
}

/** GitHub import failed */
export function trackGithubImportFailed(error: string) {
  capture("github_import_failed", { error })
}

// ─── Invite / Referral ──────────────────────────────────────────────────────

/** Invite modal opened */
export function trackInviteModalOpened() {
  capture("invite_modal_opened")
}

/** Invite link copied */
export function trackInviteLinkCopied() {
  capture("invite_link_copied")
}

/** Invite email sent */
export function trackInviteEmailSent() {
  capture("invite_email_sent")
}

/** User lands on invite page */
export function trackReferralLanding(code: string) {
  capture("referral_landing", { referral_code: code })
}

// ─── Deploy ─────────────────────────────────────────────────────────────────

/** Deploy page viewed */
export function trackDeployPageViewed() {
  capture("deploy_page_viewed")
}

/** Deploy form submitted */
export function trackDeploySubmitted(properties?: { template?: string; domain?: string }) {
  capture("deploy_submitted", properties)
}

/** Deploy succeeded */
export function trackDeploySuccess(domain: string) {
  capture("deploy_success", { domain })
}

/** Deploy failed */
export function trackDeployFailed(error: string) {
  capture("deploy_failed", { error })
}

// ─── Integrations ───────────────────────────────────────────────────────────

/** User views integrations settings */
export function trackIntegrationsViewed() {
  capture("integrations_viewed")
}

/** User connects an integration */
export function trackIntegrationConnected(provider: string) {
  capture("integration_connected", { provider })
}

/** User disconnects an integration */
export function trackIntegrationDisconnected(provider: string) {
  capture("integration_disconnected", { provider })
}

// ─── Skills ─────────────────────────────────────────────────────────────────

/** Skills menu opened */
export function trackSkillsMenuOpened() {
  capture("skills_menu_opened")
}

/** Skill selected from menu */
export function trackSkillSelected(properties: { skill_id: string; skill_name: string; source: string }) {
  capture("skill_selected", properties)
}

// ─── Sandbox / Preview Panel ────────────────────────────────────────────────

/** Sandbox mode changed (preview/code/terminal/files) */
export function trackSandboxModeChanged(mode: string) {
  capture("sandbox_mode_changed", { mode })
}

/** Element selector activated */
export function trackElementSelectorActivated() {
  capture("element_selector_activated")
}

// ─── File Operations ────────────────────────────────────────────────────────

/** User uploads a file/image */
export function trackFileUploaded(properties?: { file_type?: string; file_size?: number; is_image?: boolean }) {
  capture("file_uploaded", properties)
}

/** User uploads an image via camera */
export function trackCameraUsed() {
  capture("camera_used")
}

// ─── Plan Mode ──────────────────────────────────────────────────────────────

/** Plan mode toggled */
export function trackPlanModeToggled(enabled: boolean) {
  capture("plan_mode_toggled", { enabled })
}

// ─── Worktrees ──────────────────────────────────────────────────────────────

/** Worktree created */
export function trackWorktreeCreated(slug: string) {
  capture("worktree_created", { slug })
}

/** Worktree switched */
export function trackWorktreeSwitched(slug: string | null) {
  capture("worktree_switched", { slug })
}

// ─── Empty State Actions ────────────────────────────────────────────────────

/** User clicks "Browse templates" in empty state */
export function trackEmptyStateBrowseTemplates() {
  capture("empty_state_browse_templates")
}

/** User clicks "Open from GitHub" in empty state */
export function trackEmptyStateOpenGithub() {
  capture("empty_state_open_github")
}

/** User clicks "Select a site" in empty state */
export function trackEmptyStateSelectSite() {
  capture("empty_state_select_site")
}

/** User clicks "Launch a template" in empty state */
export function trackEmptyStateLaunchTemplate() {
  capture("empty_state_launch_template")
}

// ─── Mobile ─────────────────────────────────────────────────────────────────

/** Mobile preview opened */
export function trackMobilePreviewOpened() {
  capture("mobile_preview_opened")
}

/** Mobile preview closed */
export function trackMobilePreviewClosed() {
  capture("mobile_preview_closed")
}

// ─── Copy Messages ──────────────────────────────────────────────────────────

/** User copies conversation messages */
export function trackMessagesCopied() {
  capture("messages_copied")
}

// ─── Theme ──────────────────────────────────────────────────────────────────

/** User toggles theme */
export function trackThemeChanged(theme: string) {
  capture("theme_changed", { theme })
}

// ─── Session ────────────────────────────────────────────────────────────────

/** Session expired */
export function trackSessionExpired() {
  capture("session_expired")
}

// ─── Photobook ──────────────────────────────────────────────────────────────

/** User selects image from photobook */
export function trackPhotobookImageSelected(imageKey: string) {
  capture("photobook_image_selected", { image_key: imageKey })
}

// ─── Drag & Drop ────────────────────────────────────────────────────────────

/** File dropped into chat */
export function trackFileDragDropped() {
  capture("file_drag_dropped")
}

// ─── Error Tracking ─────────────────────────────────────────────────────────

/** User hits error boundary */
export function trackErrorBoundaryHit(properties?: { component?: string; error_message?: string }) {
  capture("error_boundary_hit", properties)
}

// ─── Drive ──────────────────────────────────────────────────────────────────

/** Drive panel opened */
export function trackDrivePanelOpened() {
  capture("drive_panel_opened")
}

/** File uploaded to drive */
export function trackDriveFileUploaded() {
  capture("drive_file_uploaded")
}

/** File deleted from drive */
export function trackDriveFileDeleted() {
  capture("drive_file_deleted")
}

// ─── Message Actions ────────────────────────────────────────────────────────

/** User deletes a message from conversation */
export function trackMessageDeleted() {
  capture("message_deleted")
}

/** User retries a failed message */
export function trackMessageRetried() {
  capture("message_retried")
}
