import type { ReactNode } from "react";
import { BankMark, type BankId } from "../components/BankMark";
import { Avatar, type AvatarTone } from "../components/Avatar";
import { InstitutionCard } from "../components/OptionCard";
import { Surface, Variation } from "../components/Surface";

interface Institution {
  id: string;
  name: string;
  detail: string;
  /** Accessible name for the mark; unique because the name repeats elsewhere. */
  label: string;
  tone: AvatarTone;
  bank: BankId;
}

/**
 * Real brand marks reversed to white on solid colour circles. The circle colour
 * is a system ramp rather than the brand colour, so every mark clears the same
 * contrast bar.
 *
 * These marks are trademarks of their owners — placeholders for layout review.
 */
const INSTITUTIONS: Institution[] = [
  { id: "chase", name: "Chase", detail: "Everyday and savings", label: "Chase institution", tone: "blue", bank: "chase" },
  { id: "bofa", name: "Bank of America", detail: "Checking and credit", label: "Bank of America institution", tone: "red", bank: "bankofamerica" },
  { id: "barclays", name: "Barclays", detail: "Current accounts", label: "Barclays institution", tone: "cyan", bank: "barclays" },
  { id: "monzo", name: "Monzo", detail: "Everyday spending", label: "Monzo institution", tone: "violet", bank: "monzo" },
  { id: "wise", name: "Wise", detail: "Multi-currency", label: "Wise institution", tone: "teal", bank: "wise" },
  { id: "robinhood", name: "Robinhood", detail: "Investments", label: "Robinhood institution", tone: "green", bank: "robinhood" },
];

/** Variation 03 — institution grid. Recognition does the work an icon was doing. */
export function InstitutionGrid(): ReactNode {
  return (
    <Variation id="variation-03">
      <Surface
        wide
        title="Link an institution"
        subtitle="Pick one to connect — it takes about a minute."
      >
        <div className="institution-grid">
          {INSTITUTIONS.map((institution) => (
            <InstitutionCard
              key={institution.id}
              name={institution.name}
              detail={institution.detail}
              mark={
                <Avatar tone={institution.tone} label={institution.label}>
                  <BankMark bank={institution.bank} />
                </Avatar>
              }
            />
          ))}
        </div>
      </Surface>
    </Variation>
  );
}
