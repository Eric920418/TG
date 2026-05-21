import { Lock, Gem } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { UpsellFeature } from "@/lib/upsell-features";

export function UpsellCard({ feature }: { feature: UpsellFeature }) {
  const Icon = feature.icon;
  return (
    <Card className="flex flex-col h-full border-zinc-200 bg-gradient-to-br from-amber-50/30 to-transparent dark:from-amber-950/10 dark:border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
            <Icon className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          </div>
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" />
            進階套餐
          </Badge>
        </div>
        <CardTitle className="text-base mt-3">{feature.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {feature.tagline}
        </p>
        <ul className="space-y-1 text-xs text-zinc-500 dark:text-zinc-400 flex-1">
          {feature.bullets.map((b, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-amber-600 dark:text-amber-500">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="pt-2 mt-auto">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
            <Gem className="h-3.5 w-3.5" />
            聯絡開發者升級
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dashboard 版的精簡卡片：只標題 + 一句話 */
export function UpsellCardMini({ feature }: { feature: UpsellFeature }) {
  const Icon = feature.icon;
  return (
    <div className="rounded-md border border-zinc-200 bg-gradient-to-br from-amber-50/40 to-transparent p-3 dark:border-zinc-800 dark:from-amber-950/10">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <span className="text-sm font-medium">{feature.title}</span>
        <Lock className="h-3 w-3 text-zinc-400 ml-auto" />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {feature.tagline}
      </p>
    </div>
  );
}
