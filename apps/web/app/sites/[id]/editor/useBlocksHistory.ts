"use client";

import { useCallback, useReducer } from "react";
import type { BlockData } from "./PropEditor";

// Capped history. 50 steps covers any realistic editing session without
// memory creep — each entry is just a reference to a previous blocks array
// (we treat the tree as immutable, so structural sharing keeps cost low).
const HISTORY_LIMIT = 50;

type State = {
  past: BlockData[][];
  present: BlockData[];
  future: BlockData[][];
};

type Action =
  // SET hard-resets history (used on page switch + initial load).
  | { type: "SET"; blocks: BlockData[] }
  // PATCH commits a new present, clearing the redo stack.
  | { type: "PATCH"; blocks: BlockData[] }
  | { type: "UNDO" }
  | { type: "REDO" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET":
      return { past: [], present: action.blocks, future: [] };

    case "PATCH": {
      // Cheap identity check: if caller hands us the same array, no-op.
      if (action.blocks === state.present) return state;
      const past = [...state.past, state.present];
      if (past.length > HISTORY_LIMIT) past.shift();
      return { past, present: action.blocks, future: [] };
    }

    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
  }
}

/**
 * useBlocksHistory holds the block tree with full undo/redo. The hook returns:
 *  - `blocks`     — the current present (use this for rendering)
 *  - `setBlocks`  — commit a new tree (history-aware; redo stack cleared)
 *  - `replaceAll` — hard-reset (page switch); clears past + future
 *  - `undo`/`redo` + `canUndo`/`canRedo` — for toolbar buttons
 */
export function useBlocksHistory(initial: BlockData[] = []) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initial,
    future: [],
  });

  const setBlocks = useCallback((blocks: BlockData[]) => {
    dispatch({ type: "PATCH", blocks });
  }, []);

  const replaceAll = useCallback((blocks: BlockData[]) => {
    dispatch({ type: "SET", blocks });
  }, []);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  return {
    blocks: state.present,
    setBlocks,
    replaceAll,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
