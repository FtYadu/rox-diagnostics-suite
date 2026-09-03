import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getEcu } from "@/data/vehicle-data";
import { ConfigurationPanel } from "@/features/config/configuration-panel";

export const Route = createFileRoute("/_shell/ecus/$ecuId/configuration")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.ecuId} configuration · ROX Diagnostics` },
      {
        name: "description",
        content: `Write and verify configuration identifiers on the ${params.ecuId} control unit with double confirmation and automatic read-back.`,
      },
      { property: "og:title", content: `${params.ecuId} configuration · ROX Diagnostics` },
      {
        property: "og:description",
        content: `Guarded UDS 0x2E configuration writes for the ${params.ecuId} control unit.`,
      },
    ],
  }),
  component: ConfigurationPage,
});

function ConfigurationPage() {
  const { ecuId } = Route.useParams();
  const navigate = useNavigate();
  const ecu = getEcu(ecuId);

  if (!ecu) {
    return (
      <div className="space-y-4">
        <PageHeader title="Unknown control unit" subtitle={`No ECU named ${ecuId}`} />
        <Button
          variant="secondary"
          className="rounded-full"
          onClick={() => void navigate({ to: "/ecus" })}
        >
          Back to ECUs
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/ecus/$ecuId"
        params={{ ecuId }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {ecu.id} overview
      </Link>
      <PageHeader
        title="Configuration write"
        subtitle={`${ecu.fullName} · UDS 0x2E · admin role, feature-flagged`}
      />
      <ConfigurationPanel ecu={ecu} />
    </div>
  );
}
