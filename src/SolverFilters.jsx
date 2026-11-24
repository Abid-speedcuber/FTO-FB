import React from "react";
import { names } from "./model/fto.js";
import { filterOptions, isPseudo } from "./model/goal-filters.js";

export default function SolverFilters({ mode, colors, filters = {}, onChange }) {
  return <div className="solver-filters">
    {(colors.length ? colors : [null]).map((color) => {
      const options = filterOptions(color ?? 0, mode), selected = filters[color] ?? {};
      const select = (field, label, values, applicable) => <label className="filter-label">
        {label}{colors.length > 1 ? ` · ${names[color]}` : ""}
        <select aria-label={`${color === null ? "" : names[color] + " "}${label.toLowerCase()}`}
          disabled={!applicable || color === null} value={applicable ? selected[field] ?? "any" : "any"}
          onChange={(event) => onChange(color, field, event.target.value)}>
          <option value="any">Any</option>
          {values.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>;
      return <div className="filter-fields" key={color ?? "none"} role="group"
        aria-label={color === null ? "Solve filters" : `${names[color]} filters`}>
        {select("slot", "Slot", options.slots, isPseudo(mode))}
        {select("triplet", mode === "fb" ? "Excluded triplet" : "Triplet", options.triplets, mode !== "fc")}
      </div>;
    })}
  </div>;
}
