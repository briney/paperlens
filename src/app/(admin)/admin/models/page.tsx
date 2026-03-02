import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ModelFormDialog } from "@/components/admin/model-form-dialog";
import { ModelActions } from "@/components/admin/model-actions";

const CATEGORY_LABEL: Record<string, string> = {
  DOCUMENT_PARSER: "Doc Parser",
  CHAT_COMPLETION: "Chat",
  EMBEDDING: "Embedding",
};

export default async function AdminModelsPage() {
  const models = await prisma.modelConfig.findMany({
    orderBy: [{ category: "asc" }, { displayName: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Model Configuration</h1>
          <p className="text-muted-foreground">
            Manage AI model deployments and settings.
          </p>
        </div>
        <ModelFormDialog mode="create" />
      </div>

      {models.length === 0 ? (
        <p className="text-sm text-muted-foreground">No models configured yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Deployment</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Cost / 1K tokens</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((model) => (
              <TableRow key={model.id}>
                <TableCell>
                  <div>
                    <span className="font-medium">{model.displayName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{model.slug}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {CATEGORY_LABEL[model.category] ?? model.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {model.deploymentName}
                </TableCell>
                <TableCell>
                  {model.isDefault && <Badge variant="default">Default</Badge>}
                </TableCell>
                <TableCell>
                  <Badge variant={model.isActive ? "secondary" : "destructive"}>
                    {model.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  ${(model.costPerInputToken * 1000).toFixed(4)} / ${(model.costPerOutputToken * 1000).toFixed(4)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <ModelFormDialog
                      mode="edit"
                      model={{
                        id: model.id,
                        slug: model.slug,
                        displayName: model.displayName,
                        provider: model.provider,
                        deploymentName: model.deploymentName,
                        endpoint: model.endpoint,
                        apiVersion: model.apiVersion,
                        category: model.category,
                        isDefault: model.isDefault,
                        isActive: model.isActive,
                        costPerInputToken: model.costPerInputToken,
                        costPerOutputToken: model.costPerOutputToken,
                        maxTokens: model.maxTokens,
                      }}
                    />
                    <ModelActions modelId={model.id} isActive={model.isActive} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
