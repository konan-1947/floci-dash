import { useRef, useState } from "react";
import {
  Box,
  Button,
  ButtonDropdown,
  ColumnLayout,
  Container,
  Header,
  Icon,
  Input,
  Modal,
  SpaceBetween,
  StatusIndicator,
  Table,
  Tabs,
  TextFilter,
  type StatusIndicatorProps,
} from "@cloudscape-design/components";
import EC2Terminal from "../../components/EC2Terminal";
import EmptyState from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import {
  useEC2Instance,
  useEC2Instances,
  useEC2RebootInstance,
  useEC2StartInstance,
  useEC2StopInstance,
  useEC2TerminateInstance,
  type EC2Instance,
} from "../../hooks/useEC2";

/** The value of the instance's `Name` tag, which the console shows as its name. */
export function instanceName(instance: { tags?: { key: string; value: string }[] }): string | undefined {
  return instance.tags?.find((t) => t.key === "Name")?.value || undefined;
}

const STATE_TYPES: Record<string, StatusIndicatorProps.Type> = {
  running: "success",
  stopped: "stopped",
  terminated: "stopped",
  "shutting-down": "pending",
  pending: "pending",
  stopping: "pending",
};

/** Instance state as the console shows it: a status icon and the state name. */
export function InstanceState({ state }: { state?: string }) {
  const name = state || "unknown";
  return <StatusIndicator type={STATE_TYPES[name] || "info"}>{name.charAt(0).toUpperCase() + name.slice(1)}</StatusIndicator>;
}

const dash = (v?: string) => v || "–";

/**
 * The console's "Instance state" menu (Stop / Start / Reboot / Terminate). Each item is
 * only enabled when every selected instance is in a state it applies to.
 */
function InstanceStateDropdown({ instances, onTerminated }: { instances: EC2Instance[]; onTerminated?: () => void }) {
  const { showToast } = useToast();
  const start = useEC2StartInstance();
  const stop = useEC2StopInstance();
  const reboot = useEC2RebootInstance();
  const terminate = useEC2TerminateInstance();
  const [confirmTerminate, setConfirmTerminate] = useState(false);

  const all = (state: string) => instances.length > 0 && instances.every((i) => i.state === state);
  const ids = instances.map((i) => i.id);
  const run = (action: { mutate: (id: string, opts: { onSuccess: () => void }) => void }, verb: string) => {
    ids.forEach((id) => action.mutate(id, { onSuccess: () => showToast("success", `Successfully ${verb} ${id}`) }));
  };

  async function handleTerminate() {
    try {
      for (const id of ids) await terminate.mutateAsync(id);
      showToast("success", `Successfully initiated termination of ${ids.join(", ")}`);
      setConfirmTerminate(false);
      onTerminated?.();
    } catch (e) {
      showToast("error", (e as Error)?.message || "Failed to terminate instance");
    }
  }

  return (
    <>
      <ButtonDropdown
        disabled={instances.length === 0}
        loading={start.isPending || stop.isPending || reboot.isPending}
        items={[
          { id: "stop", text: "Stop instance", disabled: !all("running") },
          { id: "start", text: "Start instance", disabled: !all("stopped") },
          { id: "reboot", text: "Reboot instance", disabled: !all("running") },
          { id: "terminate", text: "Terminate (delete) instance" },
        ]}
        onItemClick={({ detail }) => {
          if (detail.id === "stop") run(stop, "stopped");
          else if (detail.id === "start") run(start, "started");
          else if (detail.id === "reboot") run(reboot, "rebooted");
          else setConfirmTerminate(true);
        }}
      >
        Instance state
      </ButtonDropdown>
      <Modal
        visible={confirmTerminate}
        onDismiss={() => setConfirmTerminate(false)}
        header="Terminate (delete) instance?"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setConfirmTerminate(false)}>Cancel</Button>
              <Button variant="primary" loading={terminate.isPending} onClick={handleTerminate}>Terminate (delete)</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="s">
          <Box>On an EBS-backed instance, the default action is for the root EBS volume to be deleted when the instance is terminated. Storage on any local drives will be lost.</Box>
          <Box variant="awsui-key-label">Instance ID</Box>
          {ids.map((id) => <div key={id}>{id}</div>)}
        </SpaceBetween>
      </Modal>
    </>
  );
}

function TerminalModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!id} onDismiss={onClose} header={`Terminal — ${id ?? ""}`} size="max">
      {id && <EC2Terminal instanceId={id} onClose={onClose} />}
    </Modal>
  );
}

// ─── Instances list ────────────────────────────────────

export function EC2InstanceList({
  onSelect,
  onLaunch,
  onLaunchFromTemplate,
}: {
  onSelect: (id: string) => void;
  onLaunch: () => void;
  onLaunchFromTemplate: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useEC2Instances();
  const [selected, setSelected] = useState<EC2Instance[]>([]);
  const [filter, setFilter] = useState("");
  const [terminalId, setTerminalId] = useState<string | null>(null);

  const all = (data?.instances || []).filter((i) => i.state !== "terminated");
  const term = filter.trim().toLowerCase();
  const items = term
    ? all.filter((i) => [i.id, instanceName(i), i.instanceType, i.state, i.privateIp, i.publicIp].some((v) => v?.toLowerCase().includes(term)))
    : all;
  // Drop selections that disappeared (e.g. terminated) on refetch.
  const current = selected.filter((s) => all.some((i) => i.id === s.id)).map((s) => all.find((i) => i.id === s.id)!);
  const connectable = current.length === 1 && current[0].state === "running";

  return (
    <SpaceBetween size="m">
      {isError && <StatusIndicator type="error">{(error as Error)?.message || "Failed to load instances"}</StatusIndicator>}
      <Table
        variant="full-page"
        selectionType="multi"
        trackBy="id"
        selectedItems={current}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        items={items}
        loading={isLoading}
        loadingText="Loading instances"
        header={
          <Header
            variant="h1"
            counter={`(${all.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh instances" onClick={() => refetch()} />
                <Button disabled={!connectable} onClick={() => setTerminalId(current[0].id)}>Connect</Button>
                <InstanceStateDropdown instances={current} onTerminated={() => setSelected([])} />
                <ButtonDropdown
                  items={[
                    { id: "details", text: "View instance details", disabled: current.length !== 1 },
                    { id: "connect", text: "Connect to instance", disabled: !connectable },
                  ]}
                  onItemClick={({ detail }) =>
                    detail.id === "details" ? onSelect(current[0].id) : setTerminalId(current[0].id)
                  }
                >
                  Actions
                </ButtonDropdown>
                <ButtonDropdown
                  variant="primary"
                  mainAction={{ text: "Launch instances", onClick: onLaunch }}
                  items={[{ id: "template", text: "Launch instance from template" }]}
                  onItemClick={onLaunchFromTemplate}
                  ariaLabel="More launch options"
                />
              </SpaceBetween>
            }
          >
            Instances
          </Header>
        }
        filter={
          <TextFilter
            filteringText={filter}
            filteringPlaceholder="Find Instance by attribute or tag (case-insensitive)"
            onChange={({ detail }) => setFilter(detail.filteringText)}
            countText={`${items.length} match${items.length === 1 ? "" : "es"}`}
          />
        }
        empty={
          term ? (
            <EmptyState title="No matches" description="No instances match the filter." />
          ) : (
            <EmptyState title="No instances" description="You do not have any instances in this region" actionText="Launch instances" onAction={onLaunch} />
          )
        }
        columnDefinitions={[
          { id: "name", header: "Name", cell: (i) => dash(instanceName(i)) },
          { id: "id", header: "Instance ID", isRowHeader: true, cell: (i) => <Button variant="inline-link" onClick={() => onSelect(i.id)}>{i.id}</Button> },
          { id: "state", header: "Instance state", cell: (i) => <InstanceState state={i.state} /> },
          { id: "type", header: "Instance type", cell: (i) => dash(i.instanceType) },
          { id: "az", header: "Availability Zone", cell: (i) => dash(i.availabilityZone) },
          { id: "publicIp", header: "Public IPv4 address", cell: (i) => dash(i.publicIp) },
          { id: "privateIp", header: "Private IPv4 address", cell: (i) => dash(i.privateIp) },
          { id: "key", header: "Key name", cell: (i) => dash(i.keyName) },
          { id: "launch", header: "Launch time", cell: (i) => (i.launchTime ? new Date(i.launchTime).toLocaleString() : "–") },
        ]}
      />
      <TerminalModal id={terminalId} onClose={() => setTerminalId(null)} />
    </SpaceBetween>
  );
}

// ─── Instance detail ───────────────────────────────────

function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <div>{children}</div>
    </div>
  );
}

export function EC2InstanceDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading, isError, error, refetch } = useEC2Instance(id);
  const [terminalId, setTerminalId] = useState<string | null>(null);

  if (isLoading) return <StatusIndicator type="loading">Loading instance details...</StatusIndicator>;
  if (isError) return <StatusIndicator type="error">{(error as Error)?.message || "Failed to load"}</StatusIndicator>;
  if (!data) return null;

  const name = instanceName(data);
  const launch = data.launchTime ? new Date(data.launchTime).toLocaleString() : "–";

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh instance" onClick={() => refetch()} />
            <Button disabled={data.state !== "running"} onClick={() => setTerminalId(id)}>Connect</Button>
            <InstanceStateDropdown instances={[data]} onTerminated={onBack} />
          </SpaceBetween>
        }
      >
        Instance summary for {data.id}{name ? ` (${name})` : ""}
      </Header>

      <Container>
        <ColumnLayout columns={3} variant="text-grid">
          <SpaceBetween size="l">
            <KeyValue label="Instance ID">{data.id}</KeyValue>
            <KeyValue label="Instance state"><InstanceState state={data.state} /></KeyValue>
            <KeyValue label="Instance type">{dash(data.instanceType)}</KeyValue>
            <KeyValue label="AMI ID">{dash(data.imageId)}</KeyValue>
          </SpaceBetween>
          <SpaceBetween size="l">
            <KeyValue label="Public IPv4 address">{dash(data.publicIp)}</KeyValue>
            <KeyValue label="Private IPv4 addresses">{dash(data.privateIp)}</KeyValue>
            <KeyValue label="Public IPv4 DNS">{dash(data.publicDns)}</KeyValue>
            <KeyValue label="Private IP DNS name">{dash(data.privateDns)}</KeyValue>
          </SpaceBetween>
          <SpaceBetween size="l">
            <KeyValue label="VPC ID">{dash(data.vpcId)}</KeyValue>
            <KeyValue label="Subnet ID">{dash(data.subnetId)}</KeyValue>
            <KeyValue label="Key pair assigned at launch">{dash(data.keyName)}</KeyValue>
            <KeyValue label="Launch time">{launch}</KeyValue>
          </SpaceBetween>
        </ColumnLayout>
      </Container>

      <Tabs
        tabs={[
          {
            id: "details",
            label: "Details",
            content: (
              <Container header={<Header variant="h2">Instance details</Header>}>
                <ColumnLayout columns={3} variant="text-grid">
                  <KeyValue label="Platform">{data.platform || "Linux/UNIX"}</KeyValue>
                  <KeyValue label="Architecture">{dash(data.architecture)}</KeyValue>
                  <KeyValue label="Availability Zone">{dash(data.availabilityZone)}</KeyValue>
                  <KeyValue label="IAM Role">{dash(data.iamInstanceProfile)}</KeyValue>
                  <KeyValue label="Monitoring">{data.monitoring || "disabled"}</KeyValue>
                  <KeyValue label="EBS-optimized">{data.ebsOptimized ? "true" : "false"}</KeyValue>
                </ColumnLayout>
              </Container>
            ),
          },
          {
            id: "security",
            label: "Security",
            content: (
              <Table
                header={<Header variant="h2" counter={`(${data.securityGroups?.length || 0})`}>Security groups</Header>}
                items={data.securityGroups || []}
                empty={<EmptyState title="No security groups" />}
                columnDefinitions={[
                  { id: "id", header: "Security group ID", cell: (g) => g.id },
                  { id: "name", header: "Security group name", cell: (g) => g.name },
                ]}
              />
            ),
          },
          {
            id: "networking",
            label: "Networking",
            content: (
              <Container header={<Header variant="h2">Networking details</Header>}>
                <ColumnLayout columns={3} variant="text-grid">
                  <KeyValue label="VPC ID">{dash(data.vpcId)}</KeyValue>
                  <KeyValue label="Subnet ID">{dash(data.subnetId)}</KeyValue>
                  <KeyValue label="Source / destination check">
                    {data.sourceDestCheck === undefined ? "–" : data.sourceDestCheck ? "Enabled" : "Disabled"}
                  </KeyValue>
                </ColumnLayout>
              </Container>
            ),
          },
          {
            id: "storage",
            label: "Storage",
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Root device details</Header>}>
                  <ColumnLayout columns={2} variant="text-grid">
                    <KeyValue label="Root device name">{dash(data.rootDeviceName)}</KeyValue>
                    <KeyValue label="Root device type">{dash(data.rootDeviceType)}</KeyValue>
                  </ColumnLayout>
                </Container>
                <Table
                  header={<Header variant="h2" counter={`(${data.blockDevices?.length || 0})`}>Block devices</Header>}
                  items={data.blockDevices || []}
                  empty={<EmptyState title="No block devices" />}
                  columnDefinitions={[
                    { id: "volume", header: "Volume ID", cell: (b) => b.volumeId },
                    { id: "device", header: "Device name", cell: (b) => b.deviceName },
                    { id: "status", header: "Attachment status", cell: (b) => b.status },
                  ]}
                />
              </SpaceBetween>
            ),
          },
          {
            id: "connect",
            label: "Connect",
            content: (
              <Container header={<Header variant="h2" description="Floci runs each instance as a Docker container.">Connection info</Header>}>
                <SpaceBetween size="s">
                  <div>
                    <Box color="text-label" fontSize="body-s" fontWeight="bold" padding={{ bottom: "xxs" }}>
                      <Icon name="script" /> Docker Exec
                    </Box>
                    <CommandBox command={`docker exec -it floci-ec2-${id} bash`} />
                  </div>
                  <div>
                    <Box color="text-label" fontSize="body-s" fontWeight="bold" padding={{ bottom: "xxs" }}>
                      <Icon name="search" /> Find SSH Port
                    </Box>
                    <CommandBox command={`docker port floci-ec2-${id} 22`} />
                  </div>
                  <div>
                    <Box color="text-label" fontSize="body-s" fontWeight="bold" padding={{ bottom: "xxs" }}>
                      <Icon name="keyboard" /> SSH (replace PORT with output above)
                    </Box>
                    <CommandBox command="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@localhost -p PORT" />
                  </div>
                </SpaceBetween>
              </Container>
            ),
          },
        ]}
      />
      <TerminalModal id={terminalId} onClose={() => setTerminalId(null)} />
    </SpaceBetween>
  );
}

export function CommandBox({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input text
      (inputRef.current as any).select();
    }
  };

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <Input
        ref={inputRef}
        readOnly
        value={command}
        onFocus={(e: any) => {
          // Try to select text in the native input element
          const nativeInput = e.target?.querySelector?.("input") || e.target;
          nativeInput.select?.();
        }}
      />
      <Button
        variant="icon"
        iconName={copied ? "status-positive" : "copy"}
        ariaLabel={copied ? "Copied" : "Copy to clipboard"}
        onClick={handleCopy}
      />
    </div>
  );
}
