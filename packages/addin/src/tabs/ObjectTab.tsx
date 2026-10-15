import type { Organization } from "@idk/shared/schemas";
import { useList } from "./common.tsx";
import { OrganizationsSection } from "./object/OrganizationsSection.tsx";
import { ObjectSection } from "./object/ObjectSection.tsx";
import { SectionsSection } from "./object/SectionsSection.tsx";
import { RepresentativesSection } from "./object/RepresentativesSection.tsx";

export function ObjectTab() {
  const [orgs, reloadOrgs] = useList<Organization>("/api/organizations");
  return (
    <>
      <OrganizationsSection orgs={orgs} onChange={reloadOrgs} />
      <ObjectSection orgs={orgs} />
      <SectionsSection orgs={orgs} />
      <RepresentativesSection orgs={orgs} />
    </>
  );
}
