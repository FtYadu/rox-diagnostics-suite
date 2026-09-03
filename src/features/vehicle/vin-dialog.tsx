import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ecus } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { useAppStore } from "@/store/app-store";
import { VinPicker } from "./vin-picker";
import { checkVin } from "./vin";

export type VinDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  /** Called with the validated VIN; the store is updated before this runs. */
  onConfirm?: (vin: string) => void;
};

const GATEWAY = ecus.find((ecu) => ecu.id === "CCU") ?? ecus[0];

/** Shared VIN entry dialog: manual input, recent VINs, or read from the gateway. */
export function VinDialog({
  open,
  onOpenChange,
  title = "Vehicle identification",
  description = "Every job is filed against this VIN.",
  confirmLabel = "Use this VIN",
  onConfirm,
}: VinDialogProps) {
  const { bridge } = useBridge();
  const storedVin = useAppStore((s) => s.vin);
  const recent = useAppStore((s) => s.vinHistory);
  const setVin = useAppStore((s) => s.setVin);
  const [draft, setDraft] = useState(storedVin);

  useEffect(() => {
    if (open) setDraft(storedVin);
  }, [open, storedVin]);

  const readFromVehicle = async (): Promise<string> => {
    if (!GATEWAY) throw new Error("No gateway ECU in the vehicle data");
    const entries = await bridge.readIdentification(GATEWAY);
    const match = entries.find(
      (entry) => entry.did.toUpperCase() === "F190" || /vin/i.test(entry.label),
    );
    if (!match) throw new Error("The gateway did not report a VIN (DID F190)");
    return match.value;
  };

  const confirm = () => {
    const parsed = checkVin(draft);
    if (!parsed.ok) return;
    setVin(parsed.vin);
    onConfirm?.(parsed.vin);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <VinPicker
          value={draft}
          onChange={setDraft}
          recent={recent}
          onReadFromVehicle={readFromVehicle}
          autoFocus
        />

        <DialogFooter>
          <Button variant="ghost" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 rounded-xl" disabled={!checkVin(draft).ok} onClick={confirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
