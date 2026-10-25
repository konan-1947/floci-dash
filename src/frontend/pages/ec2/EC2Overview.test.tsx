// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const m = vi.hoisted(() => ({ data: {} as Record<string, any> }));

vi.mock("../../hooks/useEC2", () => ({
  useEC2Instances: () => ({ data: m.data.instances }),
  useEC2KeyPairs: () => ({ data: m.data.keyPairs }),
  useEC2SecurityGroups: () => ({ data: m.data.securityGroups }),
  useEC2Volumes: () => ({ data: m.data.volumes }),
  useEC2ElasticIps: () => ({ data: m.data.addresses }),
  useEC2LaunchTemplates: () => ({ data: m.data.launchTemplates }),
  useEC2Amis: () => ({ data: m.data.images }),
}));

import EC2Overview from "./EC2Overview";

beforeEach(() => {
  m.data = {};
});

describe("EC2Overview", () => {
  it("counts resources, ignoring terminated instances", () => {
    m.data = {
      instances: { instances: [{ id: "a", state: "running" }, { id: "b", state: "stopped" }, { id: "c", state: "terminated" }] },
      keyPairs: { keyPairs: [{}, {}, {}] },
      securityGroups: { securityGroups: [{}] },
      volumes: { volumes: [{}, {}] },
      addresses: { addresses: [] },
      launchTemplates: { launchTemplates: [{}] },
      images: { images: [{}, {}, {}, {}] },
    };
    render(<EC2Overview onOpen={vi.fn()} onLaunch={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Instances (running): 1" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Instances: 2" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Key pairs: 3" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "AMIs: 4" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Elastic IPs: 0" })).toBeTruthy();
  });

  it("shows zero while data loads, opens sections and launches", () => {
    const onOpen = vi.fn();
    const onLaunch = vi.fn();
    render(<EC2Overview onOpen={onOpen} onLaunch={onLaunch} />);
    fireEvent.click(screen.getByRole("link", { name: "Security groups: 0" }));
    expect(onOpen).toHaveBeenCalledWith("security-groups");
    fireEvent.click(screen.getByRole("button", { name: "Launch instance" }));
    expect(onLaunch).toHaveBeenCalled();
  });
});
