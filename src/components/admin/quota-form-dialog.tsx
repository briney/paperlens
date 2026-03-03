"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { TIER_DEFAULTS, type TierName } from "@/lib/quota-defaults";

interface QuotaFormDialogProps {
  userId: string;
  userName: string | null;
  buttonLabel?: string;
  quota: {
    tier: string;
    maxPapersPerDay: number;
    maxPapersPerMonth: number;
    maxTokensPerMonth: number;
  } | null;
}

export function QuotaFormDialog({ userId, userName, buttonLabel, quota }: QuotaFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const defaults = TIER_DEFAULTS.FREE;
  const [form, setForm] = useState({
    tier: quota?.tier ?? "FREE",
    maxPapersPerDay: quota?.maxPapersPerDay ?? defaults.maxPapersPerDay,
    maxPapersPerMonth: quota?.maxPapersPerMonth ?? defaults.maxPapersPerMonth,
    maxTokensPerMonth: quota?.maxTokensPerMonth ?? defaults.maxTokensPerMonth,
  });

  function resetForm() {
    setForm({
      tier: quota?.tier ?? "FREE",
      maxPapersPerDay: quota?.maxPapersPerDay ?? defaults.maxPapersPerDay,
      maxPapersPerMonth: quota?.maxPapersPerMonth ?? defaults.maxPapersPerMonth,
      maxTokensPerMonth: quota?.maxTokensPerMonth ?? defaults.maxTokensPerMonth,
    });
  }

  function handleTierChange(tier: string) {
    const tierDefaults = TIER_DEFAULTS[tier as TierName] ?? defaults;
    setForm({
      tier,
      maxPapersPerDay: tierDefaults.maxPapersPerDay,
      maxPapersPerMonth: tierDefaults.maxPapersPerMonth,
      maxTokensPerMonth: tierDefaults.maxTokensPerMonth,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/quotas/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to update quota");
        return;
      }

      toast.success("Quota updated");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to update quota");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant={buttonLabel ? "outline" : "ghost"} size="sm">
          <Pencil className="h-3.5 w-3.5" />
          {buttonLabel ? <span className="ml-1">{buttonLabel}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Quota — {userName || "User"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tier">Tier</Label>
            <Select value={form.tier} onValueChange={handleTierChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FREE">Free</SelectItem>
                <SelectItem value="PRO">Pro</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="papersPerDay">Papers per Day</Label>
            <Input
              id="papersPerDay"
              type="number"
              value={form.maxPapersPerDay}
              onChange={(e) => setForm((f) => ({ ...f, maxPapersPerDay: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="papersPerMonth">Papers per Month</Label>
            <Input
              id="papersPerMonth"
              type="number"
              value={form.maxPapersPerMonth}
              onChange={(e) => setForm((f) => ({ ...f, maxPapersPerMonth: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tokensPerMonth">Tokens per Month</Label>
            <Input
              id="tokensPerMonth"
              type="number"
              value={form.maxTokensPerMonth}
              onChange={(e) => setForm((f) => ({ ...f, maxTokensPerMonth: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Quota"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
