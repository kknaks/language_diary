import React from 'react';
import { Text, StyleSheet } from 'react-native';

interface Props {
  text: string;
  highlights: string[];
  textStyle?: object;
}

interface Segment {
  text: string;
  highlighted: boolean;
}

function buildSegments(text: string, highlights: string[]): Segment[] {
  if (!highlights.length) return [{ text, highlighted: false }];

  // Build a regex that matches any of the highlight terms (case-insensitive)
  const escaped = highlights
    .filter((h) => h.trim().length > 0)
    .map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (!escaped.length) return [{ text, highlighted: false }];

  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(pattern);

  const lowerHighlights = highlights.map((h) => h.toLowerCase());

  return parts.map((part) => ({
    text: part,
    highlighted: lowerHighlights.includes(part.toLowerCase()),
  }));
}

export default function HighlightedText({ text, highlights, textStyle }: Props) {
  const segments = buildSegments(text, highlights);

  return (
    <Text style={textStyle}>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <Text key={i} style={styles.highlight}>{seg.text}</Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  highlight: {
    backgroundColor: '#FFE066',
    color: '#1a1a1a',
    lineHeight: 20,
  },
});
