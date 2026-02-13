/**
 * Tool Component Registrations
 *
 * Register React components for custom tool rendering.
 * Display config (autoExpand, preview) is in @webalive/tools.
 *
 * Import this file once at app initialization.
 */

// === Calendar Components ===
import { CalendarEventDraftOutput, validateCalendarEventDraft } from "@/components/calendar/CalendarEventDraftOutput"
import {
  LinearCommentResult,
  LinearCommentsResult,
  validateLinearComment,
  validateLinearComments,
} from "@/components/linear/LinearCommentResult"
// === Linear Components ===
import { LinearIssueResult, validateLinearIssue } from "@/components/linear/LinearIssueResult"
import { LinearIssuesResult, validateLinearIssues } from "@/components/linear/LinearIssuesResult"
import { AutomationConfigOutput, validateAutomationConfig } from "@/components/ui/chat/tools/ai/AutomationConfigOutput"
// === AI Components ===
import {
  ClarificationQuestionsOutput,
  validateClarificationQuestions,
} from "@/components/ui/chat/tools/ai/ClarificationQuestionsOutput"
import { validateWebsiteConfig, WebsiteConfigOutput } from "@/components/ui/chat/tools/ai/WebsiteConfigOutput"
// === Email Components (superadmin only) ===
import { EmailDraftOutput, validateEmailDraft } from "@/components/ui/chat/tools/email/EmailDraftOutput"
// === Plan Mode Components ===
import { PlanApprovalOutput, validatePlanApproval } from "@/components/ui/chat/tools/plan/PlanApprovalOutput"
import { AI, CALENDAR, EMAIL, LINEAR, PLAN, registerComponent } from "./tool-registry"

// ============================================================
// LINEAR COMPONENTS
// ============================================================

registerComponent(LINEAR.CREATE_ISSUE, LinearIssueResult, validateLinearIssue)
registerComponent(LINEAR.UPDATE_ISSUE, LinearIssueResult, validateLinearIssue)
registerComponent(LINEAR.GET_ISSUE, LinearIssueResult, validateLinearIssue)
registerComponent(LINEAR.LIST_ISSUES, LinearIssuesResult, validateLinearIssues)
registerComponent(LINEAR.CREATE_COMMENT, LinearCommentResult, validateLinearComment)
registerComponent(LINEAR.LIST_COMMENTS, LinearCommentsResult, validateLinearComments)

// Note: LIST_PROJECTS and LIST_TEAMS use default JSON rendering (no custom component)

// ============================================================
// EMAIL COMPONENTS (superadmin feature flag)
// ============================================================

registerComponent(EMAIL.COMPOSE, EmailDraftOutput, validateEmailDraft)
registerComponent(EMAIL.CREATE_DRAFT, EmailDraftOutput, validateEmailDraft)
registerComponent(EMAIL.REPLY, EmailDraftOutput, validateEmailDraft)

// ============================================================
// CALENDAR COMPONENTS (Google Calendar integration)
// ============================================================

registerComponent(CALENDAR.COMPOSE_EVENT, CalendarEventDraftOutput, validateCalendarEventDraft)
registerComponent(CALENDAR.PROPOSE_MEETING, CalendarEventDraftOutput, validateCalendarEventDraft)

// Note: LIST_CALENDARS, LIST_EVENTS, GET_EVENT, SEARCH_EVENTS, CHECK_AVAILABILITY use default JSON rendering

// ============================================================
// AI COMPONENTS (clarification questions, website config)
// ============================================================

registerComponent(AI.ASK_CLARIFICATION, ClarificationQuestionsOutput, validateClarificationQuestions)
registerComponent(AI.ASK_WEBSITE_CONFIG, WebsiteConfigOutput, validateWebsiteConfig)
registerComponent(AI.ASK_AUTOMATION_CONFIG, AutomationConfigOutput, validateAutomationConfig)

// ============================================================
// PLAN MODE COMPONENTS
// ============================================================

registerComponent(PLAN.EXIT_PLAN_MODE, PlanApprovalOutput, validatePlanApproval)
