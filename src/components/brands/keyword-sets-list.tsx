"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FolderOpen, Plus, Play, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KeywordSet } from "@/types";

interface KeywordSetsListProps {
  brandId: string;
  keywordSets: KeywordSet[];
}

export function KeywordSetsList({ brandId, keywordSets }: KeywordSetsListProps) {
  if (!keywordSets || keywordSets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Prompt Sets</CardTitle>
            <Button asChild size="sm">
              <Link href={`/brands/${brandId}/keyword-sets/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Set
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">No prompt sets yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create prompt sets to organize your search queries and run visibility analyses
            </p>
            <Button asChild>
              <Link href={`/brands/${brandId}/keyword-sets/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Prompt Set
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Prompt Sets</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/brands/${brandId}/keyword-sets`}>View All</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/brands/${brandId}/keyword-sets/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Set
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-center">Prompts</TableHead>
              <TableHead className="text-center">Last Run</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keywordSets.slice(0, 5).map((set) => (
              <TableRow key={set.id}>
                <TableCell>
                  <Link
                    href={`/brands/${brandId}/keyword-sets/${set.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {set.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">
                  {set.description || "—"}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{set.prompt_count || 0}</Badge>
                </TableCell>
                <TableCell className="text-center text-muted-foreground">
                  {set.last_run_at
                    ? new Date(set.last_run_at).toLocaleDateString()
                    : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm">
                      <Play className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/brands/${brandId}/keyword-sets/${set.id}`}>
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/brands/${brandId}/keyword-sets/${set.id}/edit`}>
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {keywordSets.length > 5 && (
          <div className="mt-4 text-center">
            <Button variant="ghost" asChild>
              <Link href={`/brands/${brandId}/keyword-sets`}>
                View all {keywordSets.length} prompt sets
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

