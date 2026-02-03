"use client"

import { CheckCircle2, Clock, Globe, Zap } from "lucide-react"
import { useState } from "react"

// Server IP for DNS configuration - configure via NEXT_PUBLIC_SERVER_IP
const SERVER_IP = process.env.NEXT_PUBLIC_SERVER_IP || "YOUR_SERVER_IP"

export default function DNSSetupPage() {
  const [provider, setProvider] = useState("")

  const providers = [
    { id: "cloudflare", name: "Cloudflare" },
    { id: "transip", name: "TransIP" },
    { id: "strato", name: "Strato" },
    { id: "mijndomein", name: "Mijndomein.nl" },
    { id: "hostnet", name: "Hostnet" },
    { id: "godaddy", name: "GoDaddy" },
    { id: "namecheap", name: "Namecheap" },
    { id: "general", name: "Other / I don't know" },
  ]

  const getInstructions = () => {
    switch (provider) {
      case "cloudflare":
        return (
          <div className="space-y-4">
            <Step number={1} title="Go to Cloudflare">
              Open your{" "}
              <a
                href="https://dash.cloudflare.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
              >
                Cloudflare Dashboard →
              </a>
            </Step>
            <Step number={2} title="Select your domain">
              Click on the domain you want to connect.
            </Step>
            <Step number={3} title="Go to DNS Records">
              Navigate to <code className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded text-sm">DNS → Records</code>
            </Step>
            <Step number={4} title="Create the connection">
              <div className="space-y-2">
                <p>
                  Click <strong>Add record</strong> and fill in:
                </p>
                <div className="bg-blue-50 dark:bg-blue-950/50 p-3 rounded-lg space-y-2 text-sm font-mono border border-blue-200 dark:border-blue-800">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Type:</span> <strong>A</strong>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Name:</span> <strong>@</strong>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">IPv4:</span> <strong>{SERVER_IP}</strong>
                  </div>
                </div>
              </div>
            </Step>
            <Step number={5} title="One quick thing">
              Make sure the cloud icon is <strong>gray</strong> (not orange). This just means DNS-only mode, which is
              what we need.
            </Step>
            <Step number={6} title="Save">
              Click <strong>Save</strong> and you're done!
            </Step>
          </div>
        )
      case "godaddy":
        return (
          <div className="space-y-4">
            <Step number={1} title="Open GoDaddy">
              Go to your{" "}
              <a
                href="https://dcc.godaddy.com/manage"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
              >
                Domain Manager →
              </a>
            </Step>
            <Step number={2} title="Find your domain">
              Click on the domain you want to connect.
            </Step>
            <Step number={3} title="Edit DNS">
              Click <strong>DNS</strong> tab.
            </Step>
            <Step number={4} title="Find the A record">
              Look for the A record with Name{" "}
              <code className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded text-sm">@</code>
            </Step>
            <Step number={5} title="Update the value">
              Click edit and change the value to{" "}
              <code className="bg-gray-100 px-2 py-1 rounded text-sm font-bold">{SERVER_IP}</code>
            </Step>
            <Step number={6} title="Save">
              Click <strong>Save</strong> and you're all set!
            </Step>
          </div>
        )
      case "namecheap":
        return (
          <div className="space-y-4">
            <Step number={1} title="Open Namecheap">
              Go to your{" "}
              <a
                href="https://ap.www.namecheap.com/domains/domaincontrolpanel"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
              >
                Domain List →
              </a>
            </Step>
            <Step number={2} title="Find your domain">
              Click <strong>Manage</strong> next to your domain.
            </Step>
            <Step number={3} title="Go to Advanced DNS">
              Click on the <strong>Advanced DNS</strong> tab.
            </Step>
            <Step number={4} title="Find the A record">
              Look for the A record with Host{" "}
              <code className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded text-sm">@</code>
            </Step>
            <Step number={5} title="Update the value">
              Change the value to <code className="bg-gray-100 px-2 py-1 rounded text-sm font-bold">{SERVER_IP}</code>
            </Step>
            <Step number={6} title="Save">
              Click the checkmark to save.
            </Step>
          </div>
        )
      case "transip":
        return (
          <div className="space-y-4">
            <Step number={1} title="Open TransIP">
              Go to{" "}
              <a
                href="https://www.transip.nl/cp/domein-hosting"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
              >
                TransIP Domain Management →
              </a>
            </Step>
            <Step number={2} title="Select your domain">
              Click on your domain from the list.
            </Step>
            <Step number={3} title="Go to DNS">
              Click the <strong>DNS</strong> tab.
            </Step>
            <Step number={4} title="Find the A record">
              Look for the A record with Name{" "}
              <code className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded text-sm">@</code>
            </Step>
            <Step number={5} title="Update the value">
              Set the value to <code className="bg-gray-100 px-2 py-1 rounded text-sm font-bold">{SERVER_IP}</code>
            </Step>
            <Step number={6} title="Save">
              Click <strong>Save</strong> and you're done!
            </Step>
          </div>
        )
      case "strato":
        return (
          <div className="space-y-4">
            <Step number={1} title="Open Strato">
              Go to your{" "}
              <a
                href="https://www.strato.nl/apps/CustomerService#/skl"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
              >
                Customer Center →
              </a>
            </Step>
            <Step number={2} title="Find Domains & SSL">
              Go to <strong>Domains & SSL</strong>.
            </Step>
            <Step number={3} title="Manage your domain">
              Click <strong>Manage</strong> next to your domain.
            </Step>
            <Step number={4} title="Go to DNS Settings">
              Click <strong>DNS Settings</strong>.
            </Step>
            <Step number={5} title="Edit the A record">
              <div className="space-y-2">
                <p>Find the A record and set:</p>
                <div className="bg-blue-50 dark:bg-blue-950/50 p-3 rounded-lg space-y-2 text-sm font-mono border border-blue-200 dark:border-blue-800">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Host:</span> <strong>@</strong>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Value:</span> <strong>{SERVER_IP}</strong>
                  </div>
                </div>
              </div>
            </Step>
            <Step number={6} title="Save">
              Click <strong>Save</strong>.
            </Step>
          </div>
        )
      case "mijndomein":
        return (
          <div className="space-y-4">
            <Step number={1} title="Open Mijndomein.nl">
              Go to{" "}
              <a
                href="https://mijn.mijndomein.nl"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
              >
                Control Panel →
              </a>
            </Step>
            <Step number={2} title="Go to Mijn Domeinen">
              Click <strong>Mijn Domeinen</strong>.
            </Step>
            <Step number={3} title="Manage your domain">
              Click <strong>Beheren</strong> next to your domain.
            </Step>
            <Step number={4} title="Go to DNS Beheer">
              Click <strong>DNS Beheer</strong>.
            </Step>
            <Step number={5} title="Edit the A record">
              <div className="space-y-2">
                <p>Find the A record and set:</p>
                <div className="bg-blue-50 dark:bg-blue-950/50 p-3 rounded-lg space-y-2 text-sm font-mono border border-blue-200 dark:border-blue-800">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Naam:</span> <strong>@</strong>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Waarde:</span> <strong>{SERVER_IP}</strong>
                  </div>
                </div>
              </div>
            </Step>
            <Step number={6} title="Save">
              Click <strong>Opslaan</strong>.
            </Step>
          </div>
        )
      case "hostnet":
        return (
          <div className="space-y-4">
            <Step number={1} title="Open Hostnet">
              Go to{" "}
              <a
                href="https://www.hostnet.nl/mijn/domeinen"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
              >
                Domain Management →
              </a>
            </Step>
            <Step number={2} title="Go to Domeinen">
              Click <strong>Domeinen</strong>.
            </Step>
            <Step number={3} title="Click your domain">
              Click on the domain you want to connect.
            </Step>
            <Step number={4} title="Go to DNS Management">
              Click <strong>DNS Management</strong>.
            </Step>
            <Step number={5} title="Edit the A record">
              <div className="space-y-2">
                <p>Find the A record and set:</p>
                <div className="bg-blue-50 dark:bg-blue-950/50 p-3 rounded-lg space-y-2 text-sm font-mono border border-blue-200 dark:border-blue-800">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Host:</span> <strong>@</strong>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">IP Address:</span> <strong>{SERVER_IP}</strong>
                  </div>
                </div>
              </div>
            </Step>
            <Step number={6} title="Update">
              Click <strong>Update</strong>.
            </Step>
          </div>
        )
      case "general":
        return (
          <div className="space-y-4">
            <Step number={1} title="Log in to your registrar">
              Go to where you bought your domain.
            </Step>
            <Step number={2} title="Find DNS settings">
              Look for "DNS", "DNS Records", or "Domain Management".
            </Step>
            <Step number={3} title="Find the A record">
              Look for a record with Name{" "}
              <code className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded text-sm">@</code>
            </Step>
            <Step number={4} title="Set the values">
              <div className="bg-blue-50 dark:bg-blue-950/50 p-3 rounded-lg space-y-2 text-sm font-mono border border-blue-200 dark:border-blue-800">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Type:</span> <strong>A</strong>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Name/Host:</span> <strong>@</strong>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Value/Points to:</span>{" "}
                  <strong>{SERVER_IP}</strong>
                </div>
              </div>
            </Step>
            <Step number={5} title="Save">
              Save the changes.
            </Step>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-normal tracking-tight text-gray-900 dark:text-white mb-4">
            Connect your domain
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 font-normal">
            Just a few quick steps to point your domain to us.
          </p>
        </div>

        {/* Progress */}
        <div className="mb-12 grid grid-cols-3 gap-4">
          <ProgressCard
            icon={<Globe className="h-6 w-6" />}
            title="1. Choose provider"
            description="Where your domain lives"
            active
            done={!!provider}
          />
          <ProgressCard
            icon={<Zap className="h-6 w-6" />}
            title="2. Update DNS"
            description="One quick change"
            active={!!provider}
            done={false}
          />
          <ProgressCard
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="3. Wait & deploy"
            description="A few minutes"
            active={false}
            done={false}
          />
        </div>

        {/* Provider Selection */}
        {!provider && (
          <div className="mb-12">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Where did you register your domain?
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {providers.map(p => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all cursor-pointer text-left"
                >
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        {provider && (
          <div className="space-y-8">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                {providers.find(p => p.id === provider)?.name}
              </h2>
              {getInstructions()}
            </div>

            {/* Timeline */}
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <Clock className="h-6 w-6 text-amber-500 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Takes a few minutes</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    DNS changes usually take 5–60 minutes to propagate worldwide. Sometimes it's instant!
                  </p>
                </div>
              </div>
            </div>

            {/* Test Instructions */}
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-8">
              <div className="flex gap-4 items-start mb-4">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Want to verify it worked?</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                    Use{" "}
                    <a
                      href="https://dnschecker.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 underline"
                    >
                      dnschecker.org →
                    </a>{" "}
                    to check your domain shows{" "}
                    <code className="bg-white dark:bg-zinc-800 px-2 py-1 rounded text-sm font-mono">{SERVER_IP}</code>
                  </p>
                </div>
              </div>
            </div>

            {/* Back Button */}
            <div className="text-center pt-4">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium"
              >
                ← Back to deployment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-semibold flex items-center justify-center text-sm">
          {number}
        </div>
      </div>
      <div className="flex-1 pt-0.5">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-gray-700 dark:text-gray-300 text-sm">{children}</p>
      </div>
    </div>
  )
}

function ProgressCard({
  icon,
  title,
  description,
  active,
  done,
}: {
  icon: React.ReactNode
  title: string
  description: string
  active: boolean
  done: boolean
}) {
  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        done
          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30"
          : active
            ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30"
            : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-zinc-800"
      }`}
    >
      <div
        className={`mb-2 ${done ? "text-green-600 dark:text-green-400" : active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}
      >
        {done ? <CheckCircle2 className="h-5 w-5" /> : icon}
      </div>
      <h3
        className={`font-semibold text-sm ${done || active ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400"}`}
      >
        {title}
      </h3>
      <p
        className={`text-xs mt-1 ${done || active ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-500"}`}
      >
        {description}
      </p>
    </div>
  )
}
