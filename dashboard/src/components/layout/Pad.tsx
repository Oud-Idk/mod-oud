export const Pad = ({ amount = 1 }: { amount?: number }) => {
    return (
        <div style={{ padding: "0", paddingTop: `${amount}rem`, margin: "0" }}/>
    )
}