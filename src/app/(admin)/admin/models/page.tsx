import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function AdminModelsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Model Configuration</h1>
          <p className="text-muted-foreground">
            Manage AI model deployments and settings.
          </p>
        </div>
        <Button disabled>
          <Plus className="mr-2 h-4 w-4" />
          Add Model
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Models</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Model management will be implemented in Phase 4.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
