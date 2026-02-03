"use client"

import { Suspense } from "react"
import { DeployForm } from "./DeployForm"
import { DeploymentHistory } from "./DeploymentHistory"

export function DeployFormWrapper() {
  return (
    <>
      <Suspense fallback={<div className="w-full max-w-md mx-auto h-64" />}>
        <DeployForm />
      </Suspense>
      <DeploymentHistory />
    </>
  )
}
