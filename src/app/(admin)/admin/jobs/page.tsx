import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminJobsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Queue</h1>
        <p className="text-muted-foreground">
          Monitor and manage the processing queue.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Job queue monitoring will be implemented in Phase 4.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
