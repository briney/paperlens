import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import Link from "next/link";

export default function PapersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Paper Library</h1>
          <p className="text-muted-foreground">
            All your uploaded papers and analyses.
          </p>
        </div>
        <Button asChild>
          <Link href="/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload Paper
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Papers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No papers yet. Upload your first paper to get started.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
