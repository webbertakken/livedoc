// @vitest-environment jsdom
// docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text documents".
import { afterEach, describe, expect, it } from 'vitest';
import { render, renderHook, waitFor } from '@testing-library/react';
import { TEXT_DOCUMENT_TEMPLATE_IDS } from '@livedoc/text-documents/templates/gallery';
import { TextTemplatePicture } from './TextTemplatePicture';
import {
  drawTextTemplatePictures,
  resetTextTemplatePicturesForTests,
  useTextTemplatePictures,
} from './useTextTemplatePictures';

afterEach(() => resetTextTemplatePicturesForTests());

describe('the template gallery’s pictures', () => {
  it('draws every template on light and dark paper, once', async () => {
    const pictures = await drawTextTemplatePictures();
    expect([...pictures.keys()]).toEqual([...TEXT_DOCUMENT_TEMPLATE_IDS]);
    const letter = pictures.get('text-letter')!;
    expect(letter.light).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(decodeURIComponent(letter.dark)).toContain('fill="#1e1f20"');
    expect(await drawTextTemplatePictures()).toBe(pictures);
  }, 30_000);

  it('are none while drawing, then every template’s', async () => {
    const { result } = renderHook(() => useTextTemplatePictures());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.size).toBe(TEXT_DOCUMENT_TEMPLATE_IDS.length), {
      timeout: 30_000,
    });
  }, 30_000);
});

describe('TextTemplatePicture', () => {
  it('is a blank page of the paper while it is drawn', () => {
    const { container } = render(<TextTemplatePicture picture={undefined} crop />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the light page in the light scheme and the dark page in the dark, decoratively', () => {
    const { container } = render(
      <TextTemplatePicture picture={{ light: 'data:light', dark: 'data:dark' }} crop={false} />,
    );
    const [light, dark] = [...container.querySelectorAll('img')];
    expect(light!.getAttribute('src')).toBe('data:light');
    expect(light!.className).toContain('dark:hidden');
    expect(dark!.getAttribute('src')).toBe('data:dark');
    expect(dark!.className).toContain('dark:block');
    expect(light!.getAttribute('alt')).toBe('');
    expect(light!.className).toContain('aspect-[17/22]');
  });
});
