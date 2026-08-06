import { InputLabel } from "@/components/layout/InputLabel";
import { TextInput } from "@/components/ui/TextInput";
import PrimaryButton from "@/components/ui/buttons/PrimaryButton";
import AlertButton from "@/components/ui/buttons/AlertButton";
import { Section } from "./Section";
import { EmbedState } from "@/features/_shared/message-creator/types";
import { EmbedField } from "@/features/_shared/embed";
import { MoveUp, MoveDown, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface FieldsSectionProps {
    embed: EmbedState;
    handleFieldChange: (index: number, key: keyof EmbedField, value: string | boolean) => void;
    addField: () => void;
    removeField: (index: number) => void;
    moveField?: (fromIndex: number, toIndex: number) => void;
}

export function FieldsSection({
    embed,
    handleFieldChange,
    addField,
    removeField,
    moveField,
}: FieldsSectionProps) {
    return (
        <Section
            title={`Fields (${embed.fields?.length || 0})`}
            defaultOpen={false}
        >

            <div className="flex flex-row justify-between items-center mt-4">
                <p className="text-muted-foreground text-sm">{embed.fields?.length} fields added</p>
                <Button onClick={addField} className="text-xs py-1 px-2.5 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add Field
                </Button>
            </div>
            {embed.fields?.length === 0 && (
                <p className="text-xs text-muted-foreground italic text-center py-2">No fields added yet.</p>
            )}
            {embed.fields?.map((field, idx) => (
                <div key={idx} className="p-3 border border-border rounded-lg space-y-3 bg-surface-muted/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <InputLabel className="block mb-1">Field Name</InputLabel>
                            <TextInput
                                value={field.name}
                                onChange={(e) => handleFieldChange(idx, "name", e.target.value)}
                                placeholder="Field Name"
                            />
                        </div>
                        <div>
                            <InputLabel className="block mb-1">Field Value</InputLabel>
                            <TextInput
                                value={field.value}
                                onChange={(e) => handleFieldChange(idx, "value", e.target.value)}
                                placeholder="Field Value"
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground select-none">
                            <input
                                type="checkbox"
                                checked={field.inline || false}
                                onChange={(e) => handleFieldChange(idx, "inline", e.target.checked)}
                                className="rounded border-border accent-brand text-brand focus-ring cursor-pointer"
                            />
                            <span>Display Inline</span>
                        </label>

                        <div className="flex items-center gap-1">
                            {moveField && idx > 0 && (
                                <button
                                    type="button"
                                    onClick={() => moveField(idx, idx - 1)}
                                    className="p-1 hover:bg-surface-active text-muted-foreground hover:text-foreground rounded transition-colors focus-ring"
                                    title="Move Up"
                                >
                                    <MoveUp className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {moveField && idx < (embed.fields?.length || 0) - 1 && (
                                <button
                                    type="button"
                                    onClick={() => moveField(idx, idx + 1)}
                                    className="p-1 hover:bg-surface-active text-muted-foreground hover:text-foreground rounded transition-colors focus-ring"
                                    title="Move Down"
                                >
                                    <MoveDown className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <Button variant="danger" onClick={() => removeField(idx)} className="py-1 px-2 text-xs flex items-center gap-1">
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                            </Button>
                        </div>
                    </div>
                </div>
            ))}
        </Section>
    );
}