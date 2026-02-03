"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/primitives/Button"

export function CardPreview() {
  return (
    <div className="space-y-8">
      {/* Basic Card */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Basic Card</h3>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>This is a description of the card content.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-black/70 dark:text-white/70">
              Card content goes here. You can put any content inside a card.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Card with Footer */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">With Footer</h3>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Subscription Plan</CardTitle>
            <CardDescription>Choose the best plan for your needs.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-black dark:text-white">
              $9<span className="text-sm font-normal text-black/60 dark:text-white/60">/month</span>
            </div>
          </CardContent>
          <CardFooter>
            <Button fullWidth>Subscribe</Button>
          </CardFooter>
        </Card>
      </section>

      {/* Minimal Card */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Minimal</h3>
        <Card className="max-w-sm p-4">
          <p className="text-sm text-black/70 dark:text-white/70">
            A simple card with just padding. No header or footer.
          </p>
        </Card>
      </section>

      {/* Card Grid */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Grid Layout</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {["Feature A", "Feature B", "Feature C"].map(feature => (
            <Card key={feature}>
              <CardHeader>
                <CardTitle className="text-lg">{feature}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-black/60 dark:text-white/60">Description for {feature.toLowerCase()}.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
