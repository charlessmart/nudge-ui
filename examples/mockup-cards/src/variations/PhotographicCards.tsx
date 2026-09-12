import type { ReactNode } from "react";
import {
  IconBuildingBank,
  IconChartLine,
  IconDiamond,
  IconHome,
} from "@tabler/icons-react";
import { PhotoCard } from "../components/ActionCards";
import { Surface, Variation } from "../components/Surface";

const unsplash = (id: string): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;

/**
 * Variation 04 — photographic cards.
 *
 * Photography from Unsplash under the Unsplash License, loaded from their CDN.
 * Each card keeps a flat dark background so it still reads if the image never
 * loads.
 */
export function PhotographicCards(): ReactNode {
  return (
    <Variation id="variation-04">
      <Surface title="Add accounts" subtitle="Pick where the money lives.">
        <div className="photo-grid">
          <PhotoCard
            title="Connect a bank"
            description="Everyday, savings and credit"
            image={unsplash("photo-1541354329998-f4d9a9f9297f")}
            chipTone="blue"
            chipIcon={<IconBuildingBank className="icon icon--16" />}
          />
          <PhotoCard
            title="Connect an investment"
            description="Brokerages and pensions"
            image={unsplash("photo-1611974789855-9c2a0a7236a3")}
            chipTone="emerald"
            chipIcon={<IconChartLine className="icon icon--16" />}
          />
          <PhotoCard
            title="Connect a mortgage"
            description="Find your lender fast"
            image={unsplash("photo-1568605114967-8130f3a36994")}
            chipTone="amber"
            chipIcon={<IconHome className="icon icon--16" />}
          />
          <PhotoCard
            title="Add something else"
            description="Property, vehicles or valuables"
            image={unsplash("photo-1610375461246-83df859d849d")}
            chipTone="violet"
            chipIcon={<IconDiamond className="icon icon--16" />}
          />
        </div>
      </Surface>
    </Variation>
  );
}
