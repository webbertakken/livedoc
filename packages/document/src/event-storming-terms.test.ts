// docs/specs/021-event-storming/board-language.md "How a term is matched".
import { describe, expect, it } from 'vitest';
import { TERM_MAX, holdsTerm, isValidTerm, replaceTerm } from './event-storming-terms';

describe('replaceTerm', () => {
  it('matches whole words, ignoring case', () => {
    expect(replaceTerm('Order Closed', 'Order', 'Booking')).toBe('Booking Closed');
    expect(replaceTerm('order placed', 'Order', 'Booking')).toBe('booking placed');
    expect(replaceTerm('Reorder Stock', 'Order', 'Booking')).toBe('Reorder Stock');
    expect(replaceTerm('Ordering Started', 'Order', 'Booking')).toBe('Ordering Started');
  });

  it('matches a plain plural and keeps it', () => {
    expect(replaceTerm('Orders Archived', 'Order', 'Booking')).toBe('Bookings Archived');
  });

  it('matches a term of several words as a run', () => {
    expect(replaceTerm('Purchase  Order Sent', 'Purchase Order', 'Request')).toBe('Request Sent');
    expect(replaceTerm('Purchase Sent, Order Kept', 'Purchase Order', 'Request')).toBe(
      'Purchase Sent, Order Kept',
    );
  });

  it('takes the casing of what it replaces', () => {
    expect(replaceTerm('ORDER PAID', 'order', 'booking')).toBe('BOOKING PAID');
    expect(replaceTerm('Order Paid', 'order', 'booking')).toBe('Booking Paid');
    expect(replaceTerm('order paid', 'Order', 'Booking')).toBe('booking paid');
    expect(replaceTerm('oRdEr paid', 'order', 'Table Booking')).toBe('Table Booking paid');
  });

  it('replaces every match', () => {
    expect(replaceTerm('Order Sent for Order', 'Order', 'Booking')).toBe(
      'Booking Sent for Booking',
    );
  });

  it('leaves the text as it is for a blank term or one that changes nothing', () => {
    expect(replaceTerm('Order Paid', ' ', 'Booking')).toBe('Order Paid');
    expect(replaceTerm('Order Paid', 'Order', 'order')).toBe('Order Paid');
    expect(replaceTerm('Order Paid', 'Order', '  ')).toBe('Order Paid');
  });

  it('reads a term with regex characters as plain text', () => {
    expect(replaceTerm('C++ Build Done', 'C++', 'Rust')).toBe('Rust Build Done');
    expect(replaceTerm('Order (Draft) Saved', '(Draft)', 'Sketch')).toBe('Order Sketch Saved');
  });

  it('matches words in any script', () => {
    expect(replaceTerm('Bestelling Geplaatst', 'bestelling', 'reservering')).toBe(
      'Reservering Geplaatst',
    );
    expect(replaceTerm('Zamówienie Złożone', 'Zamówienie', 'Rezerwacja')).toBe(
      'Rezerwacja Złożone',
    );
  });
});

describe('holdsTerm', () => {
  it('says whether a text holds the term as replaceTerm would match it', () => {
    expect(holdsTerm('Orders Archived', 'order')).toBe(true);
    expect(holdsTerm('Reorder Stock', 'order')).toBe(false);
    expect(holdsTerm('Anything', '  ')).toBe(false);
  });
});

describe('isValidTerm', () => {
  it('takes text that is not blank and within the limit', () => {
    expect(isValidTerm('Order')).toBe(true);
    expect(isValidTerm('   ')).toBe(false);
    expect(isValidTerm('x'.repeat(TERM_MAX + 1))).toBe(false);
    expect(isValidTerm(4)).toBe(false);
  });
});
