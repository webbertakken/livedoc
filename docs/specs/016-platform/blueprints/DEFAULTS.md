# Blueprint defaults

| Blueprint                  | Default                                                                          | Why                                               |
| -------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| element-kinds-on-demand.md | The gate waits for its families to settle, with no time limit of its own         | A chunk fetch ends by itself (loaded or failed)   |
| element-kinds-on-demand.md | An idle prefetch that fails is forgotten, not shown                              | Nothing on screen needs it; a needed load retries |
| element-kinds-on-demand.md | The notice shows while a needed load has failed; an idle one never shows it      | A family no one waits on is not worth an alarm    |
| element-kinds-on-demand.md | A palette press whose family fails places nothing                                | An element is never placed without its face       |
| element-kinds-on-demand.md | Membership follows the palette's grouping (Behaviour tiles are session controls) | One grouping the user already sees                |
