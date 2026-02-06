"use client"

import { useBuilding, useGoal, useGoalActions, useTargetUsers } from "@/lib/stores/goalStore"
import { input, text } from "../styles"
import { SettingsTabLayout } from "./SettingsTabLayout"

export function GoalSettings() {
  const goal = useGoal()
  const building = useBuilding()
  const targetUsers = useTargetUsers()
  const { setGoal, setBuilding, setTargetUsers } = useGoalActions()

  return (
    <SettingsTabLayout
      title="Project Context"
      description="Help the Agent Manager understand your project to give better suggestions"
    >
      <div className="space-y-4 sm:space-y-5">
        {/* PR Goal */}
        <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-50">
          <label htmlFor="pr-goal" className={`block ${text.label} mb-1`}>
            PR Goal
          </label>
          <p className={`${text.description} mb-2`}>What should the agent accomplish this session?</p>
          <textarea
            id="pr-goal"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="e.g., Build a landing page for a plumbing business with hero, services, and contact form"
            rows={3}
            className={`${input} resize-none`}
          />
        </div>

        {/* What we're building */}
        <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-100">
          <label htmlFor="building" className={`block ${text.label} mb-1`}>
            What are you building?
          </label>
          <p className={`${text.description} mb-2`}>Describe the business/project in one sentence</p>
          <input
            id="building"
            type="text"
            value={building}
            onChange={e => setBuilding(e.target.value)}
            placeholder="e.g., Emergency plumbing service website for Amsterdam"
            className={input}
          />
        </div>

        {/* Target Users */}
        <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-150">
          <label htmlFor="target-users" className={`block ${text.label} mb-1`}>
            Who are the target users?
          </label>
          <p className={`${text.description} mb-2`}>Who will visit this site? Be specific.</p>
          <input
            id="target-users"
            type="text"
            value={targetUsers}
            onChange={e => setTargetUsers(e.target.value)}
            placeholder="e.g., Homeowners in Randstad needing urgent plumbing repairs"
            className={input}
          />
        </div>

        {/* Info Box */}
        <div className="p-4 bg-violet-500/5 dark:bg-violet-500/5 rounded-xl border border-violet-500/10 dark:border-violet-500/10 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-200">
          <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">
            <strong>Why this matters:</strong> The Agent Manager uses this context to evaluate progress, make
            user-focused suggestions, and keep the project on track. Clear context = better AI guidance.
          </p>
        </div>
      </div>
    </SettingsTabLayout>
  )
}
