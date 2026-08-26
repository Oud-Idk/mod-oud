use super::models::Pokemon;
use crate::constants::BRAND_COLOR;
use serenity::all::CreateEmbed;

#[allow(clippy::cast_lossless)]
pub fn create_pokemon_message(pkm: &Pokemon) -> CreateEmbed {
    let title_name = format!(
        "#{:04} - {}{}",
        pkm.id,
        pkm.name[..1].to_uppercase(),
        &pkm.name[1..]
    );

    let stats_text = pkm
        .stats
        .iter()
        .map(|s| {
            let label = match s.stat.name.as_str() {
                "hp" => "HP",
                "attack" => "Atk",
                "defense" => "Def",
                "special-attack" => "Sp.Atk",
                "special-defense" => "Sp.Def",
                "speed" => "Speed",
                other => other,
            };
            format!("**{label}:** {}", s.base_stat)
        })
        .collect::<Vec<_>>()
        .join(" | ");

    let abilities_text = pkm
        .abilities
        .iter()
        .map(|a| {
            let name = format!(
                "{}{}",
                a.ability.name[..1].to_uppercase(),
                &a.ability.name[1..]
            );
            if a.is_hidden {
                format!("{name} *(Hidden)*")
            } else {
                name
            }
        })
        .collect::<Vec<_>>()
        .join(", ");

    let height_m = pkm.height as f64 / 10.0;
    let weight_kg = pkm.weight as f64 / 10.0;

    let mut embed = CreateEmbed::new()
        .title(title_name)
        .url(format!("https://pokemondb.net/pokedex/{}", pkm.name))
        .color(BRAND_COLOR)
        .field("🏷️ Types", pkm.format_types(), true)
        .field("📏 Height", format!("{height_m:.1} m"), true)
        .field("⚖️ Weight", format!("{weight_kg:.1} kg"), true)
        .field("✨ Abilities", abilities_text, false)
        .field("📊 Base Stats", stats_text, false);

    if let Some(art) = pkm.artwork_url() {
        embed = embed.image(art);
    }

    embed
}
