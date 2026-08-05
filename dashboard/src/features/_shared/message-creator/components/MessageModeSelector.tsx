import { JSX } from "react";
import { Format } from "@/features/_shared/embed";
import { SegmentedControl, SegmentedOption } from "@/components/ui/SegmentedControl";

interface MessageModeSelectorProps {
    format: Format;
    label?: string;
    disabled?: boolean;
    onChange: (format: Format) => void;
}

const FORMAT_OPTIONS: SegmentedOption<Format>[] = [
    { value: "TEXT", label: "Plaintext Message" },
    { value: "EMBED", label: "Rich Embed" },
];

export function MessageModeSelector({
    format,
    label = "Message Mode",
    disabled = false,
    onChange
}: MessageModeSelectorProps): JSX.Element {
    return (
        <SegmentedControl<Format>
            label={label}
            value={format}
            options={FORMAT_OPTIONS}
            disabled={disabled}
            onChange={onChange}
        />
    );
}