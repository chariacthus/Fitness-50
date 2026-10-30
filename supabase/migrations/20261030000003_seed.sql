-- =============================================================================
-- Stærk50 – initial configuration
-- Prices below are TEST prices (is_test = true). Test products can only be
-- bought while Stripe runs in test mode, and checkout stays closed until an
-- administrator has set a real price and enabled checkout.
-- =============================================================================

insert into public.site_settings (id, coach_short_bio, membership_description, nutrition_description)
values (
  1,
  '[Indsæt en kort præsentation af Christian – f.eks. baggrund, erfaring og hvorfor han træner mænd over 50.]',
  'Ét medlemskab giver adgang til din personlige træningsplan, fællesskabet, private beskeder med Christian og nyt fra Christian. Medlemskabet fornyes automatisk hver måned og kan opsiges når som helst.',
  'Få en personlig kostplan, som Christian sammensætter ud fra dine vaner, præferencer og mål. Kostplanen er et tilkøb og betales én gang.'
)
on conflict (id) do nothing;

insert into public.admin_settings (id) values (1) on conflict (id) do nothing;

insert into public.products (slug, kind, name, short_description, description, features, price_amount, billing_interval, is_test, is_active, sort_order)
values
  (
    'medlemskab', 'membership', 'Stærk50 medlemskab',
    'Personlig træningsplan, fællesskab og direkte kontakt til Christian.',
    'Medlemskabet fornyes automatisk hver måned, indtil du opsiger det. Du kan opsige når som helst og beholder adgangen resten af den periode, du har betalt for.',
    array[
      'Personlig træningsplan lavet af Christian',
      'Adgang til fællesskabet og gruppechatten',
      'Private beskeder med Christian og andre medlemmer',
      'Træningsvideoer og nyt fra Christian',
      'Opdaterede planer, når du gør fremskridt'
    ],
    9900, 'month', true, true, 0
  ),
  (
    'kostplan', 'addon', 'Personlig kostplan',
    'En kostplan sammensat af Christian ud fra dine vaner og mål.',
    'Kostplanen er et engangskøb. Christian laver planen ud fra dine svar i et kort spørgeskema.',
    array[
      'Måltidsidéer og forslag til dagens struktur',
      'Generelle råd tilpasset din hverdag',
      'Personlige noter fra Christian'
    ],
    4900, 'one_time', true, true, 10
  )
on conflict (slug) do nothing;
