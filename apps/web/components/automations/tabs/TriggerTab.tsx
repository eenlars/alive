import type { TriggerType } from "@/lib/api/schemas"
import type { AutomationJob } from "@/lib/hooks/useSettingsQueries"
import { CronScheduler } from "../cron-scheduler"

const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "Amsterdam (CET)", value: "Europe/Amsterdam" },
  { label: "London (GMT)", value: "Europe/London" },
  { label: "New York (EST)", value: "America/New_York" },
  { label: "Los Angeles (PST)", value: "America/Los_Angeles" },
]

const selectChevron = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: "36px",
} as const

interface ScheduleTriggerProps {
  isEditing: boolean
  isOneTime: boolean
  onOneTimeChange: (v: boolean) => void
  cronSchedule: string
  onCronChange: (v: string) => void
  oneTimeDate: string
  onOneTimeDateChange: (v: string) => void
  oneTimeTime: string
  onOneTimeTimeChange: (v: string) => void
  timezone: string
  onTimezoneChange: (v: string) => void
  effectiveIsOneTime: boolean
}

interface EventTriggerProps {
  triggerType: TriggerType
  editingJob: AutomationJob
}

interface TriggerTabProps {
  hasSchedule: boolean
  schedule?: ScheduleTriggerProps
  event?: EventTriggerProps
}

export function TriggerTab({ hasSchedule, schedule, event }: TriggerTabProps) {
  if (hasSchedule && schedule) {
    return <ScheduleTrigger {...schedule} />
  }

  if (!hasSchedule && event) {
    return <EventTrigger {...event} />
  }

  return <p className="text-sm text-black/40 dark:text-white/40">Trigger type is set when creating the agent.</p>
}

function ScheduleTrigger({
  isEditing,
  isOneTime,
  onOneTimeChange,
  cronSchedule,
  onCronChange,
  oneTimeDate,
  onOneTimeDateChange,
  oneTimeTime,
  onOneTimeTimeChange,
  timezone,
  onTimezoneChange,
  effectiveIsOneTime,
}: ScheduleTriggerProps) {
  return (
    <div className="space-y-3">
      <CronScheduler
        value={cronSchedule}
        onChange={onCronChange}
        showOneTime={true}
        lockOneTimeToggle={isEditing}
        isOneTime={isOneTime}
        onOneTimeChange={onOneTimeChange}
        oneTimeDate={oneTimeDate}
        oneTimeTime={oneTimeTime}
        onOneTimeDateChange={onOneTimeDateChange}
        onOneTimeTimeChange={onOneTimeTimeChange}
      />

      {!effectiveIsOneTime && (
        <div className="space-y-1.5">
          <label htmlFor="auto-tz" className="text-xs font-medium text-black/60 dark:text-white/60">
            Timezone
          </label>
          <select
            id="auto-tz"
            value={timezone}
            onChange={e => onTimezoneChange(e.target.value)}
            className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer appearance-none"
            style={selectChevron}
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

function EventTrigger({ triggerType, editingJob }: EventTriggerProps) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03]">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-black dark:text-white">
          {triggerType === "email" ? "Email trigger" : "Webhook trigger"}
        </p>
        {triggerType === "email" && editingJob.email_address && (
          <p className="text-[11px] text-black/40 dark:text-white/40 mt-0.5 font-mono truncate">
            {editingJob.email_address}
          </p>
        )}
      </div>
    </div>
  )
}
