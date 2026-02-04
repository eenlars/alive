/**
 * Centralized error codes for consistent error handling across frontend and backend
 */

export const ErrorCodes = {
  // Workspace errors (1xxx)
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  WORKSPACE_INVALID: "WORKSPACE_INVALID",
  WORKSPACE_MISSING: "WORKSPACE_MISSING",
  WORKSPACE_NOT_AUTHENTICATED: "WORKSPACE_NOT_AUTHENTICATED",
  PATH_OUTSIDE_WORKSPACE: "PATH_OUTSIDE_WORKSPACE",

  // Authentication errors (2xxx)
  NO_SESSION: "NO_SESSION",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  UNAUTHORIZED: "UNAUTHORIZED",
  ORG_ACCESS_DENIED: "ORG_ACCESS_DENIED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  INSUFFICIENT_TOKENS: "INSUFFICIENT_TOKENS",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",

  // Request errors (3xxx)
  INVALID_JSON: "INVALID_JSON",
  INVALID_REQUEST: "INVALID_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MISSING_SLUG: "MISSING_SLUG",
  INVALID_SLUG: "INVALID_SLUG",
  UNKNOWN_ACTION: "UNKNOWN_ACTION",
  ORG_ID_REQUIRED: "ORG_ID_REQUIRED",
  INVALID_DOMAIN: "INVALID_DOMAIN",
  DOMAIN_ALREADY_EXISTS: "DOMAIN_ALREADY_EXISTS",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",

  // Conversation errors (4xxx)
  CONVERSATION_BUSY: "CONVERSATION_BUSY",

  // SDK errors (5xxx)
  QUERY_FAILED: "QUERY_FAILED",
  ERROR_MAX_TURNS: "ERROR_MAX_TURNS",
  API_AUTH_FAILED: "API_AUTH_FAILED",

  // Tool errors (5.5xxx)
  TOOL_NOT_ALLOWED: "TOOL_NOT_ALLOWED",

  // File errors (6xxx)
  FILE_READ_ERROR: "FILE_READ_ERROR",
  FILE_WRITE_ERROR: "FILE_WRITE_ERROR",
  FILE_DELETE_ERROR: "FILE_DELETE_ERROR",
  FILE_PROTECTED: "FILE_PROTECTED",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  PATH_IS_DIRECTORY: "PATH_IS_DIRECTORY",
  BINARY_FILE_NOT_SUPPORTED: "BINARY_FILE_NOT_SUPPORTED",
  FILE_TOO_LARGE_TO_READ: "FILE_TOO_LARGE_TO_READ",

  // Package management errors (6.5xxx)
  PACKAGE_INSTALL_FAILED: "PACKAGE_INSTALL_FAILED",
  DEV_SERVER_RESTART_FAILED: "DEV_SERVER_RESTART_FAILED",
  DEV_SERVER_START_FAILED: "DEV_SERVER_START_FAILED",

  // Image errors (7xxx)
  TENANT_NOT_CONFIGURED: "TENANT_NOT_CONFIGURED",
  NO_FILE: "NO_FILE",
  FILE_TOO_SMALL: "FILE_TOO_SMALL",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
  IMAGE_PROCESSING_FAILED: "IMAGE_PROCESSING_FAILED",
  IMAGE_UPLOAD_FAILED: "IMAGE_UPLOAD_FAILED",
  IMAGE_LIST_FAILED: "IMAGE_LIST_FAILED",
  IMAGE_DELETE_FAILED: "IMAGE_DELETE_FAILED",

  // Stream errors (8xxx)
  STREAM_ERROR: "STREAM_ERROR",
  STREAM_PARSE_ERROR: "STREAM_PARSE_ERROR",
  RESPONSE_CREATION_FAILED: "RESPONSE_CREATION_FAILED",

  // Workspace management errors (9xxx)
  WORKSPACE_RESTART_FAILED: "WORKSPACE_RESTART_FAILED",
  SLUG_TAKEN: "SLUG_TAKEN",
  SITE_NOT_FOUND: "SITE_NOT_FOUND",
  DEPLOYMENT_FAILED: "DEPLOYMENT_FAILED",
  EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED",
  ORG_NOT_FOUND: "ORG_NOT_FOUND",
  SITE_LIMIT_EXCEEDED: "SITE_LIMIT_EXCEEDED",

  // Template errors (9.2xxx)
  INVALID_TEMPLATE: "INVALID_TEMPLATE",
  TEMPLATE_NOT_FOUND: "TEMPLATE_NOT_FOUND",

  // Permission errors (9.5xxx)
  PERMISSION_CHECK_FAILED: "PERMISSION_CHECK_FAILED",
  PERMISSION_FIX_FAILED: "PERMISSION_FIX_FAILED",
  SITE_DIRECTORY_NOT_FOUND: "SITE_DIRECTORY_NOT_FOUND",
  SITE_USER_NOT_FOUND: "SITE_USER_NOT_FOUND",

  // OAuth/Integration errors (10xxx)
  INVALID_PROVIDER: "INVALID_PROVIDER",
  OAUTH_CONFIG_ERROR: "OAUTH_CONFIG_ERROR",
  OAUTH_STATE_MISMATCH: "OAUTH_STATE_MISMATCH",
  INTEGRATION_ERROR: "INTEGRATION_ERROR",
  INTEGRATION_NOT_CONNECTED: "INTEGRATION_NOT_CONNECTED",
  INTEGRATION_NOT_CONFIGURED: "INTEGRATION_NOT_CONFIGURED",

  // Referral errors (11xxx)
  REFERRAL_INVALID_CODE: "REFERRAL_INVALID_CODE",
  REFERRAL_ALREADY_INVITED: "REFERRAL_ALREADY_INVITED",
  REFERRAL_NOT_FOUND: "REFERRAL_NOT_FOUND",
  REFERRAL_CREDIT_FAILED: "REFERRAL_CREDIT_FAILED",
  USER_NOT_FOUND: "USER_NOT_FOUND",

  // Automation errors (12xxx)
  AUTOMATION_JOB_NOT_FOUND: "AUTOMATION_JOB_NOT_FOUND",
  AUTOMATION_JOB_DISABLED: "AUTOMATION_JOB_DISABLED",
  AUTOMATION_ALREADY_RUNNING: "AUTOMATION_ALREADY_RUNNING",

  // General errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  REQUEST_PROCESSING_FAILED: "REQUEST_PROCESSING_FAILED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  TEST_MODE_BLOCK: "TEST_MODE_BLOCK",
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StructuredError {
  ok: false
  error: ErrorCode
  message: string
  help?: string
  details?: Record<string, any>
  requestId?: string
}

/**
 * Get user-friendly error message based on error code
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getErrorMessage(code: ErrorCode, details?: Record<string, any>): string {
  switch (code) {
    case ErrorCodes.WORKSPACE_NOT_FOUND:
      return details?.host
        ? `I cannot find the workspace directory for '${details.host}'. Please ask your administrator to set up the workspace.`
        : "I cannot find the workspace directory. Please ask your administrator to set up the workspace."

    case ErrorCodes.WORKSPACE_INVALID:
      return "The workspace path is not valid. Please contact your administrator."

    case ErrorCodes.WORKSPACE_MISSING:
      return "I need a workspace to work in. Please provide a workspace parameter."

    case ErrorCodes.WORKSPACE_NOT_AUTHENTICATED:
      return "You need to log in to access this workspace. Please enter your passcode."

    case ErrorCodes.PATH_OUTSIDE_WORKSPACE:
      return details?.attemptedPath
        ? `I cannot access '${details.attemptedPath}' - it's outside my allowed workspace. I can only access files within your project directory.`
        : "I cannot access this file - it's outside my allowed workspace. I can only access files within your project directory."

    case ErrorCodes.NO_SESSION:
    case ErrorCodes.AUTH_REQUIRED:
      return "You need to log in first. Please refresh the page and enter your passcode."

    case ErrorCodes.UNAUTHORIZED:
      return "You don't have access to this. Please check with your administrator if you need permission."

    case ErrorCodes.ORG_ACCESS_DENIED:
      return "You do not have access to this organization. Please check with your administrator if you need permission."

    case ErrorCodes.INVALID_CREDENTIALS:
      return "The passcode is incorrect. Please check your passcode and try again."

    case ErrorCodes.INVALID_SIGNATURE:
      return "Invalid webhook signature. The request could not be verified."

    case ErrorCodes.INSUFFICIENT_TOKENS:
      return details?.balance !== undefined
        ? `You don't have enough tokens to make this request (current balance: ${details.balance}). Please contact support to add more tokens.`
        : "You don't have enough tokens to make this request. Please contact support to add more tokens."

    case ErrorCodes.INSUFFICIENT_CREDITS:
      return details?.balance !== undefined
        ? `You don't have enough credits to make this request (current balance: ${details.balance}). Please contact support to add more credits.`
        : "You don't have enough credits to make this request. Please contact support to add more credits."

    case ErrorCodes.INVALID_JSON:
      return "I received malformed data. Please try sending your message again."

    case ErrorCodes.INVALID_REQUEST:
      return details?.field
        ? `The ${details.field} field is missing or invalid. Please check your input.`
        : "Something is missing or incorrect in your request. Please check your input and try again."

    case ErrorCodes.CONVERSATION_BUSY:
      return "I'm still working on your previous request. Please wait for me to finish before sending another message."

    case ErrorCodes.QUERY_FAILED:
      return "I encountered an error while processing your request. This might be a temporary issue - please try again."

    case ErrorCodes.ERROR_MAX_TURNS:
      return "This conversation has become too long. Please start a new conversation to continue."

    case ErrorCodes.TOOL_NOT_ALLOWED: {
      const tool = details?.tool || "this tool"
      const allowed = details?.allowed?.join(", ") || "file operation tools"
      return `I cannot use ${tool} for security reasons. I can only use these tools: ${allowed}`
    }

    case ErrorCodes.FILE_READ_ERROR:
      return details?.filePath
        ? `I cannot read the file '${details.filePath}'. It might not exist, or I might not have permission to read it.`
        : "I cannot read this file. It might not exist, or I might not have permission to read it."

    case ErrorCodes.FILE_WRITE_ERROR:
      return details?.filePath
        ? `I cannot write to '${details.filePath}'. I might not have permission to modify it.`
        : "I cannot write to this file. I might not have permission to modify it."

    case ErrorCodes.FILE_DELETE_ERROR:
      return details?.filePath
        ? `I cannot delete '${details.filePath}'. ${details.error || "I might not have permission."}`
        : "I cannot delete this file. I might not have permission."

    case ErrorCodes.FILE_PROTECTED:
      return details?.reason ? `Cannot delete: ${details.reason}` : "This file is protected and cannot be deleted."

    case ErrorCodes.FILE_NOT_FOUND:
      return details?.filePath ? `The file '${details.filePath}' does not exist.` : "The file does not exist."

    case ErrorCodes.PATH_IS_DIRECTORY:
      return details?.filePath
        ? `'${details.filePath}' is a directory, not a file. I can only read files.`
        : "This path is a directory, not a file. I can only read files."

    case ErrorCodes.BINARY_FILE_NOT_SUPPORTED:
      return details?.extension
        ? `I cannot read binary files (.${details.extension}). Please use a different tool for binary files.`
        : "I cannot read binary files. Please use a different tool for binary files."

    case ErrorCodes.FILE_TOO_LARGE_TO_READ:
      return details?.size
        ? `This file is too large to read (${Math.round(details.size / 1024)}KB). Maximum size is 1MB.`
        : "This file is too large to read. Maximum size is 1MB."

    case ErrorCodes.PACKAGE_INSTALL_FAILED:
      return details?.package
        ? `I couldn't install the '${details.package}' package. ${details.reason || "Please try again."}`
        : "I couldn't install the package. Please try again."

    case ErrorCodes.DEV_SERVER_RESTART_FAILED:
      return details?.service
        ? `I installed the package successfully, but couldn't restart the dev server (${details.service}). You may need to restart it manually.`
        : "I installed the package successfully, but couldn't restart the dev server. You may need to restart it manually."

    case ErrorCodes.DEV_SERVER_START_FAILED:
      return details?.service
        ? `The package installed successfully, but the dev server failed to start. There may be an error in your code or a missing dependency. ${details.message || ""}`
        : "The package installed successfully, but the dev server failed to start. There may be an error in your code or a missing dependency."

    case ErrorCodes.API_AUTH_FAILED:
      return "API authentication failed. The API key may be expired or invalid."

    case ErrorCodes.TENANT_NOT_CONFIGURED:
      return "Image uploads are not set up for this workspace yet. Please contact your administrator."

    case ErrorCodes.NO_FILE:
      return "You didn't select a file. Please choose an image to upload."

    case ErrorCodes.FILE_TOO_SMALL:
      return details?.minSize
        ? `This image is too small. Please select an image larger than ${details.minSize}.`
        : "This image is too small. Please select a larger image."

    case ErrorCodes.FILE_TOO_LARGE:
      return details?.maxSize
        ? `This image is too large. Please select an image smaller than ${details.maxSize}.`
        : "This image is too large. Please select a smaller image (max 10MB)."

    case ErrorCodes.INVALID_FILE_TYPE:
      return "I can only process image files (PNG, JPG, WebP). Please select a valid image."

    case ErrorCodes.IMAGE_PROCESSING_FAILED:
      return "I couldn't process this image. The file might be corrupted - please try a different image."

    case ErrorCodes.IMAGE_UPLOAD_FAILED:
      return "I couldn't upload the image. Please check your connection and try again."

    case ErrorCodes.IMAGE_LIST_FAILED:
      return "I couldn't load the list of images. Please refresh the page and try again."

    case ErrorCodes.IMAGE_DELETE_FAILED:
      return "I couldn't delete the image. Please try again or contact support if the problem persists."

    case ErrorCodes.STREAM_ERROR:
      return "I encountered an error while streaming my response. You might see incomplete messages. Please try asking again."

    case ErrorCodes.STREAM_PARSE_ERROR:
      return "I had trouble sending my response. Some parts might be missing. Please try again."

    case ErrorCodes.RESPONSE_CREATION_FAILED:
      return "I couldn't start responding to your message. Please try sending it again."

    case ErrorCodes.WORKSPACE_RESTART_FAILED:
      return "I couldn't restart your workspace. Please try again or contact support if the problem continues."

    case ErrorCodes.VALIDATION_ERROR:
      return details?.message || "Something in your input isn't valid. Please check what you entered and try again."

    case ErrorCodes.TOO_MANY_REQUESTS:
      return details?.retryAfter
        ? `Too many requests. Please try again in ${details.retryAfter}.`
        : "Too many requests. Please try again later."

    case ErrorCodes.MISSING_SLUG:
      return "You need to provide a site name (slug). Please enter a site name."

    case ErrorCodes.INVALID_SLUG:
      return "The site name format is invalid. Please use only letters, numbers, and hyphens."

    case ErrorCodes.UNKNOWN_ACTION:
      return details?.action
        ? `I don't know how to handle the action '${details.action}'. Please check the available actions.`
        : "I don't recognize that action. Please check the available actions."

    case ErrorCodes.ORG_ID_REQUIRED:
      return "Organization ID is required. Please select an organization to deploy to."

    case ErrorCodes.INVALID_DOMAIN:
      return details?.error || "Invalid domain name. Please provide a valid domain."

    case ErrorCodes.DOMAIN_ALREADY_EXISTS:
      return details?.domain
        ? `The domain '${details.domain}' already exists. Please choose a different domain.`
        : "This domain already exists. Please choose a different domain."

    case ErrorCodes.SLUG_TAKEN:
      return details?.slug
        ? `The site name '${details.slug}' is already in use. Please choose a different name.`
        : "This site name is already in use. Please choose a different name."

    case ErrorCodes.SITE_NOT_FOUND:
      return details?.slug
        ? `I couldn't find a site named '${details.slug}'. Please check the name and try again.`
        : "I couldn't find that site. Please check the site name and try again."

    case ErrorCodes.DEPLOYMENT_FAILED:
      return "I couldn't deploy your site. Please check the deployment logs to see what went wrong."

    case ErrorCodes.EMAIL_ALREADY_REGISTERED:
      return details?.email
        ? `The email '${details.email}' is already registered in the system. Please use a different email or login with this existing account.`
        : "This email is already registered. Please use a different email or login with your existing account."

    case ErrorCodes.ORG_NOT_FOUND:
      return details?.orgId
        ? `The organization '${details.orgId}' was not found or is not accessible.`
        : "The specified organization was not found or is not accessible."

    case ErrorCodes.SITE_LIMIT_EXCEEDED:
      return details?.limit
        ? `You have reached the maximum limit of ${details.limit} sites. Please delete an existing site to create a new one.`
        : "You have reached the maximum number of sites. Please delete an existing site to create a new one."

    case ErrorCodes.INVALID_TEMPLATE:
      return details?.templateId
        ? `Invalid template '${details.templateId}'. Available templates: ${details.available || "blank, gallery, business, saas, event"}.`
        : `Invalid template. Available templates: ${details?.available || "blank, gallery, business, saas, event"}.`

    case ErrorCodes.TEMPLATE_NOT_FOUND:
      return details?.templateId
        ? `Template '${details.templateId}' exists but its source directory is missing at '${details.path || "unknown path"}'. Please contact support.`
        : "Template source directory is missing. Please contact support."

    case ErrorCodes.PERMISSION_CHECK_FAILED:
      return details?.domain
        ? `Failed to check file permissions for ${details.domain}. ${details.reason || "Please try again."}`
        : "Failed to check file permissions. Please try again."

    case ErrorCodes.PERMISSION_FIX_FAILED:
      return details?.domain
        ? `Failed to fix file permissions for ${details.domain}. ${details.reason || "Please try again."}`
        : "Failed to fix file permissions. Please try again."

    case ErrorCodes.SITE_DIRECTORY_NOT_FOUND:
      return details?.domain
        ? `Site directory does not exist for ${details.domain}. The site may not be deployed yet.`
        : "Site directory does not exist. The site may not be deployed yet."

    case ErrorCodes.SITE_USER_NOT_FOUND:
      return details?.user
        ? `System user '${details.user}' does not exist. The site may not be properly configured.`
        : "System user for this site does not exist. The site may not be properly configured."

    case ErrorCodes.INVALID_PROVIDER:
      return details?.reason || "Invalid provider name. Please use a supported integration provider."

    case ErrorCodes.OAUTH_CONFIG_ERROR:
      return details?.provider
        ? `${details.provider} integration is not configured. Please contact your administrator to set up the OAuth credentials.`
        : "OAuth integration is not configured. Please contact your administrator to set up the OAuth credentials."

    case ErrorCodes.OAUTH_STATE_MISMATCH:
      return "OAuth security verification failed. This may be a security issue or an expired authorization. Please try connecting again."

    case ErrorCodes.INTEGRATION_ERROR:
      return details?.provider
        ? `Failed to connect to ${details.provider}. ${details.reason || "Please try again."}`
        : "Failed to connect to the integration. Please try again."

    case ErrorCodes.INTEGRATION_NOT_CONNECTED:
      return details?.provider
        ? `You are not connected to ${details.provider}. Please connect your account first in Settings.`
        : "You are not connected to this integration. Please connect your account first in Settings."

    case ErrorCodes.INTEGRATION_NOT_CONFIGURED:
      return details?.message || details?.provider
        ? `${details.provider || "Integration"} is connected but not configured. Please complete the setup in Settings.`
        : "Integration is connected but not fully configured. Please complete the setup in Settings."

    case ErrorCodes.TEST_MODE_BLOCK:
      return "I'm in test mode right now and can't make real API calls. Please mock this endpoint in your test."

    case ErrorCodes.REFERRAL_INVALID_CODE:
      return "The invite code is invalid or has expired."

    case ErrorCodes.REFERRAL_ALREADY_INVITED:
      return details?.email
        ? `An invitation has already been sent to ${details.email}.`
        : "An invitation has already been sent to this email."

    case ErrorCodes.REFERRAL_NOT_FOUND:
      return "No pending referral was found."

    case ErrorCodes.REFERRAL_CREDIT_FAILED:
      return "Failed to award referral credits. Please contact support."

    case ErrorCodes.USER_NOT_FOUND:
      return details?.userId ? `User '${details.userId}' was not found.` : "User not found."

    case ErrorCodes.AUTOMATION_JOB_NOT_FOUND:
      return details?.jobId ? `Automation job '${details.jobId}' was not found.` : "Automation job not found."

    case ErrorCodes.AUTOMATION_JOB_DISABLED:
      return "This automation job is disabled and cannot be triggered."

    case ErrorCodes.AUTOMATION_ALREADY_RUNNING:
      return "This automation is already running. Please wait for it to complete."

    case ErrorCodes.INTERNAL_ERROR:
      return "Something went wrong on my end. This is usually temporary - please try again in a moment."

    case ErrorCodes.REQUEST_PROCESSING_FAILED:
      return "I couldn't process your request. Please try again, and contact support if the problem continues."

    default:
      return "Something unexpected went wrong. Please try again, and let support know if you keep seeing this."
  }
}

/**
 * Get detailed help text for error codes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getErrorHelp(code: ErrorCode, details?: Record<string, any>): string | null {
  switch (code) {
    case ErrorCodes.WORKSPACE_NOT_FOUND:
      if (details?.suggestion) {
        return details.suggestion
      }
      return "Ask your administrator to create the workspace directory for this domain."

    case ErrorCodes.PATH_OUTSIDE_WORKSPACE:
      return details?.workspacePath
        ? `I can only work with files in: ${details.workspacePath}`
        : "For security, I can only access files within your project workspace."

    case ErrorCodes.ERROR_MAX_TURNS:
      return "Click 'New Conversation' to start fresh and continue working."

    case ErrorCodes.TOOL_NOT_ALLOWED:
      return "For security, I'm limited to file operations: Read, Write, Edit, Glob (find files), and Grep (search files)."

    case ErrorCodes.FILE_READ_ERROR:
      return "Make sure the file exists and hasn't been deleted. Check that the file path is correct."

    case ErrorCodes.FILE_WRITE_ERROR:
      return "Make sure the file isn't locked by another program and that your workspace has write permissions."

    case ErrorCodes.FILE_DELETE_ERROR:
      return "Make sure the file isn't locked and you have permission to delete it."

    case ErrorCodes.FILE_PROTECTED:
      return "Some files like index.ts, package.json, and node_modules are protected to keep your site running."

    case ErrorCodes.FILE_NOT_FOUND:
      return "The file may have been moved or already deleted. Try refreshing the file list."

    case ErrorCodes.STREAM_PARSE_ERROR:
      return "This usually happens with network issues. Try refreshing the page or checking your connection."

    case ErrorCodes.CONVERSATION_BUSY:
      return "Wait a moment for my current response to finish, then you can send your next message."

    case ErrorCodes.INVALID_CREDENTIALS:
      return "Check your passcode and try again."

    case ErrorCodes.API_AUTH_FAILED:
      return "Please contact the system administrator to update the API key."

    default:
      return null
  }
}

/**
 * Check if an error code is workspace-related
 */
export function isWorkspaceError(code: string): boolean {
  return code.startsWith("WORKSPACE_")
}
