import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileQuestion } from "lucide-react";

export default function PaperNotFound() {
  return (
    <div className="flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground" />
          <CardTitle className="mt-4">Paper not found</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            This paper doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <Button asChild>
            <Link href="/papers">Back to Papers</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
