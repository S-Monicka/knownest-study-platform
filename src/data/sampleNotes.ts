export interface SampleNoteTemplate {
  id: string;
  label: string;
  subject: string;
  content: string;
}

export const SAMPLE_NOTE_TEMPLATES: SampleNoteTemplate[] = [
  {
    id: "bio-atp",
    label: "Cellular Respiration",
    subject: "Cell Biology",
    content: `Cellular Respiration & ATP Synthesis — Lecture Notes

1. Overview of Cellular Respiration
Cellular respiration is the catabolic pathway by which eukaryotic and prokaryotic cells oxidize organic fuels (primarily glucose, C6H12O6) to synthesize adenosine triphosphate (ATP), the cell's primary energy currency. The overall balanced reaction is:
C6H12O6 + 6 O2 -> 6 CO2 + 6 H2O + Energy (ATP + heat).
It consists of four main stages: Glycolysis, Pyruvate Oxidation, the Citric Acid Cycle (Krebs Cycle), and Oxidative Phosphorylation.

2. Glycolysis (Cytosol)
- Occurs in the cytosol and does NOT require oxygen (anaerobic).
- Splits one 6-carbon glucose molecule into two 3-carbon pyruvate molecules.
- Energy investment phase consumes 2 ATP; payoff phase produces 4 ATP via substrate-level phosphorylation and 2 NADH.
- Net yield per glucose: 2 Pyruvate, 2 ATP (net), 2 NADH.
- Key regulatory enzyme: Phosphofructokinase (PFK), inhibited by high ATP and citrate, activated by AMP.

3. Pyruvate Oxidation & Citric Acid Cycle (Mitochondrial Matrix)
- In the presence of O2, pyruvate enters the mitochondrial matrix and is converted to Acetyl-CoA by the pyruvate dehydrogenase complex, releasing 1 CO2 and generating 1 NADH per pyruvate (2 CO2 and 2 NADH per glucose).
- Acetyl-CoA (2C) combines with Oxaloacetate (4C) to form Citrate (6C).
- Each turn of the Citric Acid Cycle yields 3 NADH, 1 FADH2, 1 GTP/ATP (substrate-level), and 2 CO2. Because two Acetyl-CoA enter per glucose, double these yields per glucose molecule.

4. Oxidative Phosphorylation (Inner Mitochondrial Membrane)
- Comprises the Electron Transport Chain (Complexes I-IV) and Chemiosmosis (ATP Synthase).
- NADH donates electrons to Complex I; FADH2 donates electrons at a lower energy level to Complex II.
- Electron flow drives proton (H+) pumping from the mitochondrial matrix into the intermembrane space, establishing an electrochemical proton gradient (proton-motive force).
- Oxygen (O2) serves as the final electron acceptor at Complex IV, combining with electrons and H+ to form water (H2O). Without O2, the entire ETC backs up and halts.
- Protons flow back into the matrix down their gradient through ATP Synthase, driving conformational changes that phosphorylate ADP to ATP (~26-28 ATP per glucose).
- Total aerobic yield per glucose: approximately 30-32 ATP.`,
  },
  {
    id: "cs-os",
    label: "OS Scheduling & Memory",
    subject: "Computer Science",
    content: `Operating Systems: CPU Scheduling & Virtual Memory — Lecture Notes

1. Processes vs. Threads
- A process is an independent program in execution with its own isolated virtual address space, file descriptors, and OS state.
- A thread is the smallest unit of CPU scheduling within a process. Threads of the same process share code, heap, and open files, while each thread maintains its own stack, program counter (PC), and registers.
- Context switching between threads of the same process is significantly faster than switching between processes because the TLB and page tables do not need to be flushed.

2. CPU Scheduling Algorithms
- First-Come, First-Served (FCFS): Non-preemptive FIFO queue. Simple, but suffers from the convoy effect where short jobs wait behind a long CPU-bound job.
- Shortest Job First (SJF) / Shortest Remaining Time First (SRTF): Provably optimal for minimizing average waiting time, though exact future CPU burst lengths are unknown and must be estimated using exponential averaging. Can cause starvation for long processes.
- Round Robin (RR): Preemptive scheduling using a fixed time quantum (q). Ensures fairness and bounded response time. If q is too large, RR degrades to FCFS; if q is too small, context-switch overhead dominates.
- Multi-Level Feedback Queue (MLFQ): Uses multiple priority queues; interactive/I/O-bound jobs stay in high-priority queues while CPU-bound jobs sink to lower-priority queues, with periodic priority boosting to prevent starvation.

3. Virtual Memory & Paging
- Virtual memory separates logical addresses (used by programs) from physical RAM addresses, allowing processes to exceed physical memory size and isolating process memory.
- Paging divides physical memory into fixed-size frames and logical memory into same-sized pages, eliminating external fragmentation (though small internal fragmentation remains on the last page).
- Page Table translates virtual page numbers (VPN) to physical frame numbers (PFN). Because page tables live in RAM, a Translation Lookaside Buffer (TLB) caches recent translations in fast hardware associative memory.
- A page fault occurs when a process accesses a valid page not currently resident in RAM (present bit = 0), triggering the OS to load the page from disk.
- Page Replacement Policies: Belady's MIN (optimal theoretical), LRU (Least Recently Used — good approximation of temporal locality), and Clock / Second-Chance algorithm (efficient hardware-approximated LRU using a reference bit).
- Thrashing occurs when a system's working set exceeds available physical frames, causing constant page faults and collapsing CPU utilization.`,
  },
];
