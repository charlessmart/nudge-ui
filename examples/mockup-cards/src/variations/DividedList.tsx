import type { ReactNode } from "react";
import {
  IconBuildingBank,
  IconChartLine,
  IconHome,
  IconPackage,
  IconSearch,
} from "@tabler/icons-react";
import { Avatar } from "../components/Avatar";
import { ListRow } from "../components/OptionCard";
import { Surface, Variation } from "../components/Surface";

/** Variation 02 — divided list. One container, hairline separators. */
export function DividedList(): ReactNode {
  return (
    <Variation id="variation-02">
      <Surface title="Add accounts" subtitle="Pick where the money lives.">
        <div className="search">
          <IconSearch className="icon icon--16" />
          <span className="t-body">Search 13,000+ institutions</span>
        </div>

        <div className="list-group">
          <span className="list-group-label">Connect</span>
          <div className="list">
            <ListRow
              title="Connect a bank"
              description="Everyday, savings and credit accounts"
              leading={
                <Avatar tone="blue" label="Bank account">
                  <IconBuildingBank className="icon" />
                </Avatar>
              }
            />
            <ListRow
              title="Connect an investment"
              description="Brokerages, pensions and retirement"
              leading={
                <Avatar tone="emerald" label="Investment account">
                  <IconChartLine className="icon" />
                </Avatar>
              }
            />
            <ListRow
              title="Connect a mortgage"
              description="Find your lender in a few steps"
              leading={
                <Avatar tone="amber" label="Mortgage account">
                  <IconHome className="icon" />
                </Avatar>
              }
            />
          </div>
        </div>

        <div className="list-group">
          <span className="list-group-label">Add manually</span>
          <div className="list">
            <ListRow
              title="Add something else"
              description="Property, vehicles or valuables"
              leading={
                <Avatar tone="violet" label="Manual asset">
                  <IconPackage className="icon" />
                </Avatar>
              }
            />
          </div>
        </div>
      </Surface>
    </Variation>
  );
}
