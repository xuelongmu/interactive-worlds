# Interactive Worlds Diagrams

## Perceive, Author, Steer, Re-ground

```mermaid
flowchart LR
    perceive["01 · PERCEIVE — Multimodal LLM reads the rendered frames"]
    author["02 · AUTHOR — LLM makes grounded choices"]
    steer["03 · STEER — effectPrompt + move; setPromptOverlay · applyMove"]
    reGround["04 · RE-GROUND — Loop closes; world has morphed"]
    worldModel["WORLD MODEL — Generates frames live"]

    perceive --> author
    author --> steer
    steer --> reGround
    reGround --> perceive

    perceive -.->|"reads"| worldModel
    steer -.->|"drives"| worldModel
```

## Exploration and Interrogation

```mermaid
flowchart TB
    exploration["EXPLORATION — Use the world model to pick up clues, read the room, and choose where to press deeper"]
    interrogation["INTERROGATION — Upgraded NPC: talk your way past the guardian; discover lore and level-progression gating"]
    sharedBackbone["SHARED BACKBONE — Authored scenario + canonical_solution"]

    exploration -->|"bundle := clue_evidence · required_evidence · wishlist · menu_image · prior_outcomes"| interrogation
    interrogation -->|"postMessage · synthesizeQuestionActions · selectedEvidence"| exploration

    exploration -.-> sharedBackbone
    interrogation -.-> sharedBackbone
```

> The screenshots' smallest handwritten labels were transcribed on a best-effort basis. The least certain label is `synthesizeQuestionActions` in the second diagram.
