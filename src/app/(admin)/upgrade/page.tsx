import { Sparkles, Phone, FileCheck, Rocket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { UpsellCard } from "@/components/upsell-card";
import { upsellFeatures } from "@/lib/upsell-features";

export default function UpgradePage() {
  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 p-2.5 shadow-sm">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">進階功能（升級解鎖）</h1>
          <p className="mt-1 text-sm text-zinc-500">
            以下功能可加購，請聯絡開發者開通。每項可單獨選購或打包升級。
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {upsellFeatures.map((f) => (
          <UpsellCard key={f.id} feature={f} />
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4">升級流程</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Step
              icon={Phone}
              n={1}
              title="聯絡開發者"
              desc="說明你想開通的功能 / 套餐，討論需求細節"
            />
            <Step
              icon={FileCheck}
              n={2}
              title="訂定方案"
              desc="依需求量身定價，確認規格與時程"
            />
            <Step
              icon={Rocket}
              n={3}
              title="開通上線"
              desc="完成後直接在現有後台看到新功能，無須額外設定"
            />
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-zinc-400">
        本頁列出的功能屬於進階加購方案，需單獨開通。已啟用功能請至各功能頁面操作。
      </p>
    </div>
  );
}

function Step({
  icon: Icon,
  n,
  title,
  desc,
}: {
  icon: typeof Sparkles;
  n: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Icon className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        </div>
      </div>
      <div>
        <p className="font-medium text-sm">
          <span className="text-amber-700 dark:text-amber-400 mr-1">{n}.</span>
          {title}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{desc}</p>
      </div>
    </div>
  );
}
