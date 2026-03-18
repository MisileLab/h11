# Arona (Multi-Node-Native Cloud Orchestrator)

## TL;DR

> **Quick Summary**: Arona is a Rust-based, open-source bare-metal IaaS cloud orchestrator (Ubicloud alternative). It automatically routes and allocates workloads (Docker/VMs) to optimal nodes using a Multi-dimensional Vector Bin-Packing algorithm to minimize resource fragmentation.
> 
> **Deliverables**:
> - Core Cargo Workspace (`api/proto`, `control-plane`, `agent`, `cli`)
> - Control Plane Scheduler (Vector Bin-Packing) with SQLite state
> - Worker Agent with an abstract `RuntimeProvider` (implementing dummy/local backend first)
> - Local multi-node simulation setup
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Workspace Setup → gRPC/Proto Contracts → Control Plane DB/Scheduler → Worker Agent → CLI & Simulation

---

## Context

### Original Request
Build a "Multi-Node-Native" alternative to Ubicloud focusing on intelligent scheduling and resource allocation for Docker containers or VMs.

### Interview Summary
**Key Discussions**:
- **Environment**: Local single machine simulating a multi-node cluster for MVP testing.
- **Tech Stack**: Rust for the entire stack (Control Plane and Agent).
- **Architecture**:
  - **Project Name**: Arona
  - **Communication**: gRPC (Tonic) for metrics reporting and commands.
  - **Execution Engine**: Abstracted Interface (`RuntimeProvider` trait) first.
  - **State Storage**: SQLite for the Control Plane.
  - **Scheduling Algorithm**: Multi-dimensional Vector Bin-Packing (Best-Fit Decreasing) to maximize density and avoid fragmentation.

### Metis Review
**Identified Gaps** (addressed):
- **Scope Creep**: Explicitly exclude multi-tenant IAM, billing, VPC networking, and persistent storage from v0. This is strictly a placement and execution MVP.
- **Failure Model & Edge Cases**: Addressed by ensuring idempotent operations (retry handling), defining heartbeat timeouts, and ensuring the control plane is the single source of truth.
- **Runtime Abstraction Leakage**: Strict capability matrix for the `RuntimeProvider` to ensure Docker and VMs can share the trait in the future.

---

## Work Objectives

### Core Objective
Deliver a functional v0 of Arona that successfully registers simulated nodes, receives deployment requests via CLI, makes intelligent placement decisions using Vector Bin-Packing, and dispatches the workloads to the assigned agents via gRPC.

### Concrete Deliverables
- `arona/api` (Tonic gRPC definitions)
- `arona/control-plane` (SQLite state, Scheduler algorithm, gRPC Server)
- `arona/agent` (gRPC Client, System metrics reporter, `RuntimeProvider` trait with dummy/local runner)
- `arona/cli` (Command-line tool to submit workload manifests)
- `arona/scripts/simulator.sh` (Local multi-agent runner)

### Definition of Done
- [ ] 3 simulated agents can register with the control plane and report CPU/RAM heartbeats.
- [ ] CLI can submit a deployment request.
- [ ] Scheduler places the workload on the optimal node based on the vector bin-packing algorithm.
- [ ] Agent receives the command and transitions the workload state.

### Must Have
- Idempotent gRPC operations (handling retries without double-creating).
- Strict separation of Control Plane state (SQLite) and Agent state.
- Pure Rust implementation using Tokio/Tonic.

### Must NOT Have (Guardrails)
- NO complex network overlays (use host networking for v0).
- NO persistent storage orchestration (local ephemeral only for v0).
- NO HA control-plane configuration (single SQLite instance is fine for v0).

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (New project)
- **Automated tests**: TDD (Test-Driven Development)
- **Framework**: Rust built-in `cargo test`
- **Agent-Executed QA**: Mandatory for all tasks. Will use `Bash` to run CLI commands, spin up processes in the background, and use `curl`/gRPC clients to assert system state.

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Start Immediately — Foundation & Contracts):
├── Task 1: Initialize Rust Workspace & Dependencies [quick]
├── Task 2: Define gRPC Protobuf Contracts [deep]
└── Task 3: Setup SQLite Database Schema [quick]

Wave 2 (After Wave 1 — Core Logic):
├── Task 4: Implement RuntimeProvider Trait & Dummy Backend [deep]
├── Task 5: Implement Vector Bin-Packing Scheduler Algorithm [ultrabrain]
└── Task 6: Implement Control Plane State Manager (DB Access) [unspecified-high]

Wave 3 (After Wave 2 — Servers & Clients):
├── Task 7: Implement Worker Agent Daemon (Heartbeat & Execution) [deep]
├── Task 8: Implement Control Plane gRPC Server (API & Routing) [deep]
└── Task 9: Implement CLI Client [quick]

Wave 4 (After Wave 3 — Integration & Simulation):
└── Task 10: Create Multi-Node Simulator Script & E2E Integration [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

---

## TODOs

- [ ] 1. Initialize Rust Workspace & Dependencies

  **What to do**:
  - Create the `arona` folder under the monorepo root (`/Users/misile/repos/h11/arona`).
  - Setup a Cargo workspace with members: `api`, `control-plane`, `agent`, `cli`.
  - Add common dependencies: `tokio`, `tonic`, `prost`, `sqlx` (for SQLite in control-plane), `serde`, `clap` (for cli).

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Basic Cargo project scaffolding.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 2, 3, 4, 5, 6
  - **Blocked By**: None

  **References**:
  - `Cargo.toml` documentation for workspace structure.

  **Acceptance Criteria**:
  - [ ] `cargo check` passes across the workspace.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Workspace builds correctly
    Tool: Bash
    Preconditions: Workspace created
    Steps:
      1. cd arona && cargo build
    Expected Result: Builds all crates without error
    Failure Indicators: Compilation errors or missing dependencies
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

- [ ] 2. Define gRPC Protobuf Contracts

  **What to do**:
  - Define `arona.proto` in the `api` crate.
  - RPCs:
    - `RegisterNode(NodeRegistration) -> RegisterResponse`
    - `Heartbeat(NodeStatus) -> HeartbeatResponse`
    - `DeployWorkload(WorkloadSpec) -> DeployResponse`
    - `StreamCommands(AgentIdentifier) -> stream Command`
  - Setup `build.rs` to compile the protos using `tonic-build`.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Designing the core protocol that dictates the rest of the system.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 7, 8
  - **Blocked By**: 1

  **References**:
  - `api/src/arona.proto` for the RPC definitions.

  **Acceptance Criteria**:
  - [ ] Protos compile successfully and generate Rust code.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Protos compile
    Tool: Bash
    Preconditions: Protos defined
    Steps:
      1. cd arona/api && cargo build
    Expected Result: Generates Rust code without errors
    Failure Indicators: tonic-build failures
    Evidence: .sisyphus/evidence/task-2-proto.txt
  ```

- [ ] 3. Setup SQLite Database Schema

  **What to do**:
  - Define the SQLite schema for the control-plane: `nodes` table (id, status, cpu, ram), `workloads` table (id, state, target_node_id, resources_required).
  - Setup `sqlx` migrations to initialize the DB.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple relational database schema definition.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 6
  - **Blocked By**: 1

  **References**:
  - `control-plane/migrations/` for SQL files.

  **Acceptance Criteria**:
  - [ ] Database migrations run cleanly on a fresh SQLite file.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Database initializes
    Tool: Bash
    Preconditions: Migrations defined
    Steps:
      1. cd arona/control-plane && sqlx database create && sqlx migrate run
    Expected Result: DB created with correct tables.
    Failure Indicators: Migration syntax errors.
    Evidence: .sisyphus/evidence/task-3-db.txt
  ```

- [ ] 4. Implement RuntimeProvider Trait & Dummy Backend

  **What to do**:
  - In the `agent` crate, define a trait `RuntimeProvider` with `start_workload(spec)`, `stop_workload(id)`, `status(id)`.
  - Create `DummyRuntime` struct implementing this trait that just logs actions and sleeps, returning fake success (enough for MVP).
  - Ensure the capability matrix restricts it to simple container-like semantics.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Defining the core abstraction for workloads.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 7
  - **Blocked By**: 1

  **Acceptance Criteria**:
  - [ ] Trait compiles and `DummyRuntime` can be instantiated in tests.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Dummy backend simulates start
    Tool: Bash
    Preconditions: Cargo test available
    Steps:
      1. cd arona/agent && cargo test dummy_runtime
    Expected Result: Test passes indicating dummy start works
    Failure Indicators: Compilation error or panic
    Evidence: .sisyphus/evidence/task-4-runtime.txt
  ```

- [ ] 5. Implement Vector Bin-Packing Scheduler Algorithm

  **What to do**:
  - In `control-plane`, create `scheduler.rs`.
  - Implement a struct/function taking a list of available `Node`s (with CPU/RAM/Disk vectors) and a `WorkloadSpec`.
  - Use **Best-Fit Decreasing** algorithm: Filter infeasible nodes -> Calculate post-placement residual capacity -> Pick node with smallest remaining capacity (to pack bins tightly).
  - Write robust unit tests verifying it prefers packing over spreading.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Implementing a multi-dimensional algorithm requires complex algorithmic thinking.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 8
  - **Blocked By**: 1

  **Acceptance Criteria**:
  - [ ] Scheduler correctly routes to the node with the tightest fit.
  - [ ] Rejects workloads if no node has capacity.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Scheduler packs tightly
    Tool: Bash
    Preconditions: Cargo test available
    Steps:
      1. cd arona/control-plane && cargo test scheduler_bin_pack
    Expected Result: Test passes showing Node A picked over Node B for bin packing
    Failure Indicators: Algorithm picks random or least-loaded instead
    Evidence: .sisyphus/evidence/task-5-scheduler.txt
  ```

- [ ] 6. Implement Control Plane State Manager (DB Access)

  **What to do**:
  - Implement `DbState` struct in `control-plane` using `sqlx`.
  - Methods: `upsert_node_heartbeat()`, `get_schedulable_nodes()`, `save_workload_assignment()`.
  - Handle idempotency (don't overwrite newer state with older retries).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: standard CRUD with sqlx but needs careful concurrency handling.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 8
  - **Blocked By**: 1, 3

  **Acceptance Criteria**:
  - [ ] Can insert and query nodes/workloads in SQLite.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Upsert node heartbeat
    Tool: Bash
    Preconditions: SQLite setup
    Steps:
      1. cd arona/control-plane && cargo test state_manager
    Expected Result: Test passes verifying data insertion and retrieval.
    Failure Indicators: SQL syntax errors or lock contention
    Evidence: .sisyphus/evidence/task-6-state.txt
  ```

- [ ] 7. Implement Worker Agent Daemon

  **What to do**:
  - In `agent`, implement a `tokio::main` process.
  - Start a background task sending `Heartbeat` RPCs to the control plane every 5 seconds.
  - Connect to `StreamCommands` gRPC stream to receive `DeployWorkload` instructions from the control plane.
  - Map received instructions to the `DummyRuntime`.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: gRPC client streaming and background async tasks.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 10
  - **Blocked By**: 2, 4

  **Acceptance Criteria**:
  - [ ] Agent binary builds and can run with a mock server.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Agent sends heartbeat
    Tool: Bash
    Preconditions: Agent code compiles
    Steps:
      1. cd arona/agent && cargo test agent_heartbeat_loop
    Expected Result: Test verifies stream connection logic
    Failure Indicators: Async deadlocks
    Evidence: .sisyphus/evidence/task-7-agent.txt
  ```

- [ ] 8. Implement Control Plane gRPC Server

  **What to do**:
  - In `control-plane`, implement the `arona.proto` server trait using Tonic.
  - `Heartbeat`: Update SQLite via `DbState`.
  - `DeployWorkload`: Call `Scheduler` -> Pick Node -> Save to DB -> Push to node's command stream.
  - Manage active agent streams using a `tokio::sync::mpsc` channel map.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Managing complex state, streams, and connecting DB+Scheduler.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 10
  - **Blocked By**: 2, 5, 6

  **Acceptance Criteria**:
  - [ ] Server builds and can accept tonic clients.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Server handles deploy request
    Tool: Bash
    Preconditions: Control plane code compiles
    Steps:
      1. cd arona/control-plane && cargo test grpc_server
    Expected Result: Mock client can deploy and receive response
    Failure Indicators: Panic in route handling
    Evidence: .sisyphus/evidence/task-8-server.txt
  ```

- [ ] 9. Implement CLI Client

  **What to do**:
  - In `cli`, use `clap` to build a simple binary `arona-cli`.
  - Commands: `arona-cli deploy <name> --cpu <cpu> --ram <ram>`.
  - Connects via gRPC to the Control Plane and issues `DeployWorkload`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard CLI wrapper around a gRPC client.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 10
  - **Blocked By**: 2

  **Acceptance Criteria**:
  - [ ] CLI parses args correctly and makes gRPC call.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: CLI parses arguments
    Tool: Bash
    Preconditions: CLI builds
    Steps:
      1. cd arona/cli && cargo run -- deploy test-app --cpu 2 --ram 1024
    Expected Result: CLI outputs connection error (since no server running yet)
    Failure Indicators: Clap parse errors
    Evidence: .sisyphus/evidence/task-9-cli.txt
  ```

- [ ] 10. Create Multi-Node Simulator Script & E2E Integration

  **What to do**:
  - Write a bash script `arona/scripts/simulator.sh` that:
    1. Compiles the workspace.
    2. Starts the control plane in the background (`sqlite://data.db`).
    3. Starts 3 instances of the Agent in the background (mocking 3 different node IDs).
    4. Uses `arona-cli` to deploy a workload.
    5. Validates via logs that the scheduler picked the optimal node and the agent executed it.
    6. Cleans up processes on exit.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Writing a robust integration test script mimicking a distributed system.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (Must run after all components)
  - **Parallel Group**: Wave 4
  - **Blocks**: Final Verification
  - **Blocked By**: 7, 8, 9

  **Acceptance Criteria**:
  - [ ] Script runs start-to-finish returning exit code 0.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: E2E Simulation Success
    Tool: Bash
    Preconditions: All binaries built
    Steps:
      1. cd arona/scripts && ./simulator.sh
    Expected Result: "E2E Test Passed" printed, processes cleaned up.
    Failure Indicators: Hangs, crashes, or incorrect node scheduling.
    Evidence: .sisyphus/evidence/task-10-e2e.txt
  ```

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo check` + `cargo clippy` + `cargo test`. Review all changed files for: `unwrap()`, unhandled errors, unused imports. Check AI slop: excessive comments, over-abstraction.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration (start simulator, CLI deploy, verify agent received it). Test edge cases. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1-3**: `chore(workspace): init arona workspace and core contracts`
- **4-6**: `feat(core): implement runtime trait, scheduler, and db state`
- **7-9**: `feat(server): implement grpc control plane, agent daemon, and cli`
- **10**: `test(e2e): add local multi-node simulator`

---

## Success Criteria

### Verification Commands
```bash
cargo check --workspace  # Expected: Compiles cleanly
cargo test --workspace   # Expected: All tests pass
./arona/scripts/simulator.sh # Expected: Spins up multiple background agents
arona-cli deploy my-workload --cpu 2 --ram 1024 # Expected: Success, routes to Agent X
```

### Final Checklist
- [ ] Core Workspace & RPCs defined
- [ ] SQLite state functioning
- [ ] Vector Bin-Packing Scheduler logic correct
- [ ] Agents can register and heartbeat
- [ ] CLI can dispatch workloads to optimal agent