import { describe, expect, it } from 'vitest';
import { articleHeadings } from './article-outline';

// docs/specs/016-platform/web-performance.md "Layout never shifts after first paint": an article's Contents are worked
// out from the article while it renders, so they are in the static HTML.

describe('articleHeadings', () => {
  it('lists the sections and sub-sections in order, with the anchors their headings carry', () => {
    const article = (
      <>
        <p>Intro</p>
        <div className="article-section">
          <h2 id="first-part">First part</h2>
          <h3 id="a-detail">A detail</h3>
        </div>
        <h2 id="second-part">Second part</h2>
      </>
    );
    expect(articleHeadings(article)).toEqual([
      { id: 'first-part', text: 'First part', level: 2 },
      { id: 'a-detail', text: 'A detail', level: 3 },
      { id: 'second-part', text: 'Second part', level: 2 },
    ]);
  });

  it('reads a heading through the formatting inside it, and anchors one without an id by its words', () => {
    const article = (
      <>
        <h2>
          The <code>colour</code> picker{' '}
        </h2>
        <h2 id="next">Next</h2>
      </>
    );
    expect(articleHeadings(article)[0]).toEqual({
      id: 'the-colour-picker',
      text: 'The colour picker',
      level: 2,
    });
  });

  it('finds headings inside callouts and other wrappers', () => {
    const article = (
      <div>
        <section>
          <h3 id="inside">Inside</h3>
        </section>
        <h3 id="outside">Outside</h3>
      </div>
    );
    expect(articleHeadings(article).map((h) => h.id)).toEqual(['inside', 'outside']);
  });

  it('is no list for a single heading, nor for an empty one', () => {
    expect(articleHeadings(<h2 id="only">Only one</h2>)).toEqual([]);
    expect(
      articleHeadings(
        <>
          {[
            <h2 key="a" />,
            <h2 key="b" id="b">
              B
            </h2>,
          ]}
        </>,
      ),
    ).toEqual([]);
  });
});
