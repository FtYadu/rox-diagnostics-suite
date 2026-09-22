import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, PenLine } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getEcu } from "@/data/vehicle-data";
import { DidReadPanel } from "@/features/config/did-read-panel";

export const Route = createFileRoute("/_shell/ecus/$ecuId/identifiers")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.ecuId} identifiers · ROX Diagnostics` },
      {
        name: "description",
        content: `Read any data identifier the ${params.ecuId} control unit publishes, with raw bytes, decoded values and expected-value comparison.`,
      },
      { property: "og:title", content: `${params.ecuId} identifiers · ROX Diagnostics` },
      {
        property: "og:description",
        content: `On-demand UDS 0x22 identifier reads for the ${params.ecuId} control unit.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IdentifiersPage,
});

function IdentifiersPage() {
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Read identifiers"
          subtitle={`${ecu.fullName} · UDS 0x22 · works on the simulator and the connected car`}
        />
        <Button asChild variant="secondary" className="min-h-11 rounded-full">
          <Link to="/ecus/$ecuId/configuration" params={{ ecuId }}>
            <PenLine className="size-4" />
            Write configuration
          </Link>
        </Button>
      </div>
      <DidReadPanel ecu={ecu} />
    </div>
  );
}
