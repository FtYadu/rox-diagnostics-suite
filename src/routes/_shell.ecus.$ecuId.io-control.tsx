import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getEcu } from "@/data/vehicle-data";
import { IoControlPanel } from "@/features/io/io-control-panel";

export const Route = createFileRoute("/_shell/ecus/$ecuId/io-control")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.ecuId} IO control · ROX Diagnostics` },
      {
        name: "description",
        content: `Drive actuators on the ${params.ecuId} control unit with UDS InputOutputControlByIdentifier: short-term adjust, freeze, reset to default and return control.`,
      },
      { property: "og:title", content: `${params.ecuId} IO control · ROX Diagnostics` },
      {
        property: "og:description",
        content: `UDS 0x2F actuator control for the ${params.ecuId} control unit on the ROX 01.`,
      },
    ],
  }),
  component: IoControlPage,
});

function IoControlPage() {
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
        title="Input / output control"
        subtitle={`${ecu.fullName} · UDS 0x2F · security access required`}
      />
      <IoControlPanel ecu={ecu} />
    </div>
  );
}
