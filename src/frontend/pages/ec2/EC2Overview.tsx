import { Box, Button, ColumnLayout, Container, Header, Link, SpaceBetween } from "@cloudscape-design/components";
import {
  useEC2Amis,
  useEC2ElasticIps,
  useEC2Instances,
  useEC2KeyPairs,
  useEC2LaunchTemplates,
  useEC2SecurityGroups,
  useEC2Volumes,
} from "../../hooks/useEC2";

/** The "EC2 Dashboard" landing page: resource counts and a Launch instance box. */
export default function EC2Overview({ onOpen, onLaunch }: { onOpen: (section: string) => void; onLaunch: () => void }) {
  const instances = (useEC2Instances().data?.instances || []).filter((i) => i.state !== "terminated");
  const resources: { label: string; section: string; count: number | undefined }[] = [
    { label: "Instances (running)", section: "instances", count: instances.filter((i) => i.state === "running").length },
    { label: "Instances", section: "instances", count: instances.length },
    { label: "Key pairs", section: "key-pairs", count: useEC2KeyPairs().data?.keyPairs?.length },
    { label: "Security groups", section: "security-groups", count: useEC2SecurityGroups().data?.securityGroups?.length },
    { label: "Volumes", section: "volumes", count: useEC2Volumes().data?.volumes?.length },
    { label: "Elastic IPs", section: "elastic-ips", count: useEC2ElasticIps().data?.addresses?.length },
    { label: "Launch templates", section: "launch-templates", count: useEC2LaunchTemplates().data?.launchTemplates?.length },
    { label: "AMIs", section: "amis", count: useEC2Amis().data?.images?.length },
  ];

  return (
    <SpaceBetween size="l">
      <Header variant="h1">EC2 Dashboard</Header>
      <Container header={<Header variant="h2" description="You are using the following Amazon EC2 resources in this Floci region.">Resources</Header>}>
        <ColumnLayout columns={4} variant="text-grid">
          {resources.map((r) => (
            <div key={r.label}>
              <Box variant="awsui-key-label">{r.label}</Box>
              <Link
                fontSize="display-l"
                href={`#${r.section}`}
                onFollow={(e) => {
                  e.preventDefault();
                  onOpen(r.section);
                }}
                ariaLabel={`${r.label}: ${r.count ?? 0}`}
              >
                {r.count ?? 0}
              </Link>
            </div>
          ))}
        </ColumnLayout>
      </Container>
      <Container header={<Header variant="h2">Launch instance</Header>}>
        <SpaceBetween size="m">
          <Box>To get started, launch an Amazon EC2 instance, which is a virtual server in the cloud.</Box>
          <div>
            <Button variant="primary" onClick={onLaunch}>Launch instance</Button>
          </div>
          <Box color="text-body-secondary" fontSize="body-s">Note: Your instances will launch in the Floci region.</Box>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
