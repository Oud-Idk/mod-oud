import { JSX } from "react";

export const Pad = ({ amount = 1 }: { amount?: number }): JSX.Element => {
    return (
        <div style={{ padding: "0", paddingTop: `${amount.toString()}rem`, margin: "0" }}/>
    )
}