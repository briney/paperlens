import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminQuotasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quota Management</h1>
        <p className="text-muted-foreground">
          Configure per-user and tier-based quotas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quotas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Quota management will be implemented in Phase 4.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
