import type { ReactNode } from "react";
import { IconBuildingBank, IconCoins } from "@tabler/icons-react";
import { BankMark } from "../components/BankMark";
import { Avatar } from "../components/Avatar";
import { PrimaryActionCard, SecondaryCard } from "../components/ActionCards";
import { Surface, Variation } from "../components/Surface";

/**
 * Variation 05 — emphasis split.
 *
 * One card carries the recommended path on the only full colour field in the
 * set; the rest stay deliberately quiet.
 */
export function EmphasisSplit(): ReactNode {
  return (
    <Variation id="variation-05">
      <Surface title="Add accounts" subtitle="Most people start with their bank.">
        <div className="emphasis">
          <PrimaryActionCard
            title="Connect a bank"
            description="Everyday, savings and credit accounts"
            leading={
              <span className="primary-mark">
                <IconBuildingBank className="icon icon--24" />
              </span>
            }
            action={
              <span className="button-primary">
                Continue
                <svg
                  className="icon icon--16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12l14 0" />
                  <path d="M13 18l6 -6" />
                  <path d="M13 6l6 6" />
                </svg>
              </span>
            }
          />

          <div className="secondary-grid">
            <SecondaryCard
              label="Chase"
              leading={<Avatar tone="blue" label="Chase shortcut">
                  <BankMark bank="chase" />
                </Avatar>}
            />
            <SecondaryCard
              label="Monzo"
              leading={<Avatar tone="violet" label="Monzo shortcut">
                  <BankMark bank="monzo" />
                </Avatar>}
            />
            <SecondaryCard
              label="Something else"
              leading={
                <Avatar tone="violet" label="Other asset shortcut">
                  <IconCoins className="icon" />
                </Avatar>
              }
            />
          </div>
        </div>
      </Surface>
    </Variation>
  );
}
