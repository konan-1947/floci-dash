import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  ExpandableSection,
  FormField,
  Grid,
  Header,
  Input,
  Select,
  SpaceBetween,
} from "@cloudscape-design/components";
import { useToast } from "../../components/Toast";
import { useEC2Amis, useEC2KeyPairs, useEC2RunInstance, useEC2SecurityGroups, useEC2Subnets } from "../../hooks/useEC2";

const DEFAULT_AMI = "ami-0abcdef1234567891";
const INSTANCE_TYPES = ["t2.micro", "t3.micro", "t3.small", "t3.medium", "t3.large", "m5.large", "c5.large"];

/** "Launch an instance", laid out like the console: settings on the left, a Summary panel on the right. */
export default function LaunchInstanceView({ onDone }: { onDone: () => void }) {
  const { showToast } = useToast();
  const runInstance = useEC2RunInstance();
  const { data: amis } = useEC2Amis();
  const { data: keyPairs } = useEC2KeyPairs();
  const { data: subnets } = useEC2Subnets();
  const { data: sgs } = useEC2SecurityGroups();

  const images = amis?.images || [];
  const [name, setName] = useState("");
  const [pickedAmi, setPickedAmi] = useState<string | null>(null);
  const [typedAmi, setTypedAmi] = useState(DEFAULT_AMI);
  const [instanceType, setInstanceType] = useState("t3.micro");
  const [keyName, setKeyName] = useState("");
  const [subnetId, setSubnetId] = useState("");
  const [securityGroupId, setSecurityGroupId] = useState("");
  const [count, setCount] = useState("1");
  const [launched, setLaunched] = useState<string[] | null>(null);

  // With AMIs available, default to the first one until the user picks another.
  const imageId = images.length ? (pickedAmi ?? images[0].id) : typedAmi.trim();
  const image = images.find((i) => i.id === imageId);
  const countNum = Number(count);
  const countValid = Number.isInteger(countNum) && countNum >= 1 && countNum <= 20;

  function launch() {
    runInstance.mutate(
      {
        imageId,
        instanceType,
        minCount: countNum,
        maxCount: countNum,
        ...(keyName ? { keyName } : {}),
        ...(subnetId ? { subnetId } : {}),
        ...(securityGroupId ? { securityGroupIds: [securityGroupId] } : {}),
        ...(name.trim() ? { tagSpecifications: [{ resourceType: "instance", tags: [{ key: "Name", value: name.trim() }] }] } : {}),
      },
      {
        onSuccess: (data: any) => setLaunched((data?.instances || []).map((i: { id: string }) => i.id)),
        onError: (e) => showToast("error", (e as Error)?.message || "Failed to launch instance"),
      },
    );
  }

  const opt = (value: string, label = value) => ({ value, label });

  // After launching, the console shows a Success page with next steps instead of the form.
  if (launched) {
    return (
      <SpaceBetween size="l">
        <Alert type="success" header="Success">
          Successfully initiated launch of instance{launched.length > 1 ? "s" : ""}
          {launched.length ? ` (${launched.join(", ")})` : ""}
        </Alert>
        <Container header={<Header variant="h2">Next Steps</Header>}>
          <SpaceBetween size="m">
            <div>
              <Box variant="h4">How to connect to your instance</Box>
              <Box>Your instance is launching and it might be a few minutes until it is in the running state, when it will be ready for you to use. Once it is running, you can connect to it from the Instances screen.</Box>
            </div>
          </SpaceBetween>
        </Container>
        <Box float="right">
          <Button variant="primary" onClick={onDone}>View all instances</Button>
        </Box>
      </SpaceBetween>
    );
  }

  return (
    <SpaceBetween size="l">
      <Header variant="h1" description="Amazon EC2 allows you to create virtual machines, or instances, that run on the AWS Cloud. Quickly get started by following the simple steps below.">
        Launch an instance
      </Header>
      <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }]}>
        <SpaceBetween size="l">
          <ExpandableSection variant="container" defaultExpanded headerText="Name and tags">
            <FormField label="Name">
              <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder="e.g. My Web Server" ariaLabel="Name" />
            </FormField>
          </ExpandableSection>

          <ExpandableSection variant="container" defaultExpanded headerText="Application and OS Images (Amazon Machine Image)" headerDescription="An AMI contains the software configuration (operating system, application server, and applications) required to launch your instance.">
            <FormField label="Amazon Machine Image (AMI)">
              {images.length ? (
                <Select
                  selectedOption={opt(imageId, image?.name ? `${imageId} — ${image.name}` : imageId)}
                  onChange={({ detail }) => setPickedAmi(detail.selectedOption.value!)}
                  options={images.map((img) => ({
                    value: img.id,
                    label: img.name ? `${img.id} — ${img.name}` : img.id,
                    description: img.platform || img.architecture || undefined,
                  }))}
                  ariaLabel="Amazon Machine Image (AMI)"
                />
              ) : (
                <Input value={typedAmi} onChange={({ detail }) => setTypedAmi(detail.value)} placeholder="ami-xxx" ariaLabel="Amazon Machine Image (AMI)" />
              )}
            </FormField>
          </ExpandableSection>

          <ExpandableSection variant="container" defaultExpanded headerText="Instance type">
            <FormField label="Instance type">
              <Select
                selectedOption={opt(instanceType)}
                onChange={({ detail }) => setInstanceType(detail.selectedOption.value!)}
                options={INSTANCE_TYPES.map((t) => opt(t))}
                ariaLabel="Instance type"
              />
            </FormField>
          </ExpandableSection>

          <ExpandableSection variant="container" defaultExpanded headerText="Key pair (login)" headerDescription="You can use a key pair to securely connect to your instance.">
            <FormField label="Key pair name">
              <Select
                selectedOption={keyName ? opt(keyName) : opt("", "Proceed without a key pair")}
                onChange={({ detail }) => setKeyName(detail.selectedOption.value!)}
                options={[opt("", "Proceed without a key pair"), ...(keyPairs?.keyPairs || []).map((k) => opt(k.name))]}
                ariaLabel="Key pair name"
              />
            </FormField>
          </ExpandableSection>

          <ExpandableSection variant="container" defaultExpanded headerText="Network settings">
            <SpaceBetween size="m">
              <FormField label="Subnet">
                <Select
                  selectedOption={subnetId ? opt(subnetId) : opt("", "No preference (Default subnet)")}
                  onChange={({ detail }) => setSubnetId(detail.selectedOption.value!)}
                  options={[opt("", "No preference (Default subnet)"), ...(subnets?.subnets || []).map((s) => opt(s.id, `${s.id} (${s.cidrBlock})`))]}
                  ariaLabel="Subnet"
                />
              </FormField>
              <FormField label="Security group">
                <Select
                  selectedOption={securityGroupId ? opt(securityGroupId) : opt("", "Default security group")}
                  onChange={({ detail }) => setSecurityGroupId(detail.selectedOption.value!)}
                  options={[opt("", "Default security group"), ...(sgs?.securityGroups || []).map((g) => opt(g.id, `${g.name} (${g.id})`))]}
                  ariaLabel="Security group"
                />
              </FormField>
            </SpaceBetween>
          </ExpandableSection>
        </SpaceBetween>

        <Container header={<Header variant="h2">Summary</Header>}>
          <SpaceBetween size="m">
            <FormField label="Number of instances" errorText={countValid ? undefined : "Enter a whole number from 1 to 20."}>
              <Input type="number" value={count} onChange={({ detail }) => setCount(detail.value)} ariaLabel="Number of instances" />
            </FormField>
            <div>
              <Box variant="awsui-key-label">Software Image (AMI)</Box>
              <div>{imageId || "–"}</div>
            </div>
            <div>
              <Box variant="awsui-key-label">Virtual server type (instance type)</Box>
              <div>{instanceType}</div>
            </div>
            <div>
              <Box variant="awsui-key-label">Firewall (security group)</Box>
              <div>{securityGroupId || "Default security group"}</div>
            </div>
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={onDone}>Cancel</Button>
              <Button variant="primary" loading={runInstance.isPending} disabled={!imageId || !countValid} onClick={launch}>
                Launch instance
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        </Container>
      </Grid>
    </SpaceBetween>
  );
}
