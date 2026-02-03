"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function TabsPreview() {
  return (
    <div className="space-y-8">
      {/* Basic Tabs */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Basic Tabs</h3>
        <Tabs defaultValue="account" className="max-w-md">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent
            value="account"
            className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-black/10 dark:border-white/10"
          >
            <h4 className="font-medium text-black dark:text-white mb-2">Account Settings</h4>
            <p className="text-sm text-black/60 dark:text-white/60">Manage your account information and preferences.</p>
          </TabsContent>
          <TabsContent
            value="password"
            className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-black/10 dark:border-white/10"
          >
            <h4 className="font-medium text-black dark:text-white mb-2">Password</h4>
            <p className="text-sm text-black/60 dark:text-white/60">Change your password and security settings.</p>
          </TabsContent>
          <TabsContent
            value="settings"
            className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-black/10 dark:border-white/10"
          >
            <h4 className="font-medium text-black dark:text-white mb-2">Settings</h4>
            <p className="text-sm text-black/60 dark:text-white/60">Configure application settings.</p>
          </TabsContent>
        </Tabs>
      </section>

      {/* Many Tabs */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Multiple Tabs</h3>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="p-4">
            <p className="text-sm text-black/60 dark:text-white/60">Overview content</p>
          </TabsContent>
          <TabsContent value="analytics" className="p-4">
            <p className="text-sm text-black/60 dark:text-white/60">Analytics content</p>
          </TabsContent>
          <TabsContent value="reports" className="p-4">
            <p className="text-sm text-black/60 dark:text-white/60">Reports content</p>
          </TabsContent>
          <TabsContent value="notifications" className="p-4">
            <p className="text-sm text-black/60 dark:text-white/60">Notifications content</p>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  )
}
