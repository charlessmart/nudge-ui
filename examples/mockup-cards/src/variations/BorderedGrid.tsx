import type { ReactNode } from "react";
import {
  IconChartLine,
  IconHome,
  IconPackage,
  IconPlus,
  IconSearch,
  IconShieldCheck,
  IconUpload,
} from "@tabler/icons-react";
import { BankMark } from "../components/BankMark";
import { Avatar, AvatarStack } from "../components/Avatar";
import { Button } from "../components/Button";
import { OptionCard } from "../components/OptionCard";
import { Surface, Variation } from "../components/Surface";

/**
 * Variation 01 — bordered grid.
 *
 * Also the Button showcase: three call sites of one component, one per variant.
 * Select any of them in the inspector and the prop contract is shared, so a
 * change to the component definition lands on all three.
 */
export function BorderedGrid(): ReactNode {
  return (
    <Variation id="variation-01">
      <Surface title="Add accounts" subtitle="Pick where the money lives.">
        <div className="search">
          <IconSearch className="icon icon--16" />
          <span className="t-body">Search 13,000+ institutions</span>
        </div>

        <div className="card-grid">
          <OptionCard
            title="Connect a bank"
            description="Chase, Barclays, 13,000+ more"
            leading={
              <AvatarStack>
                <Avatar tone="blue" label="Chase">
                  <BankMark bank="chase" />
                </Avatar>
                <Avatar tone="red" label="Bank of America">
                  <BankMark bank="bankofamerica" />
                </Avatar>
                <Avatar tone="cyan" label="Barclays">
                  <BankMark bank="barclays" />
                </Avatar>
              </AvatarStack>
            }
          />

          <OptionCard
            title="Connect an investment"
            description="Brokerages, funds and pensions"
            leading={
              <AvatarStack>
                <Avatar tone="green" label="Robinhood">
                  <BankMark bank="robinhood" />
                </Avatar>
                <Avatar tone="teal" label="Wise">
                  <BankMark bank="wise" />
                </Avatar>
                <Avatar tone="violet" label="Monzo">
                  <BankMark bank="monzo" />
                </Avatar>
              </AvatarStack>
            }
          />

          <OptionCard
            title="Connect a mortgage"
            description="Any lender or servicer"
            leading={
              <Avatar tone="amber" label="Mortgage lender">
                <IconUpload className="icon" />
              </Avatar>
            }
          />

          <OptionCard
            title="Add something else"
            description="Like jewellery, vehicles or art"
            leading={
              <Avatar tone="violet" label="Other asset">
                <IconPlus className="icon" />
              </Avatar>
            }
          />
        </div>

        <div className="footnote">
          <IconShieldCheck className="icon icon--16" />
          <span>Read-only access. Disconnect whenever you like.</span>
        </div>

        <div className="surface-actions">
          <Button variant="primary" label="Connect an account" />
          <Button variant="secondary" label="Not now" />
          <Button variant="tertiary" label="Learn more" />
        </div>
      </Surface>
    </Variation>
  );
}
