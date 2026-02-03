import { DeployFormWrapper } from "@/features/deployment/components/DeployFormWrapper"

export default function DeployPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 py-16 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center">
        <DeployFormWrapper />
      </div>
    </div>
  )
}
